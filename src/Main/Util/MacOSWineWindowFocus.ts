import { spawn } from "child_process";
import path from "path";
import type { Logger } from "../Manager/LogManager";
import {
  command_runs_windows_executable,
  find_managed_wine_processes,
  type ManagedWineProcess,
} from "./ManagedWineProcesses";

const DEFAULT_FOCUS_TIMEOUT_MS = 45_000;
const DEFAULT_FOCUS_POLL_INTERVAL_MS = 750;
const PREFIX_PROCESS_FALLBACK_DELAY_MS = 2_000;
const APPLE_SCRIPT_TIMEOUT_MS = 3_000;
const MAX_FOCUS_PROCESS_IDS = 64;

export interface MacOSWineWindowFocusRequest {
  prefixPath: string;
  executableNames?: readonly string[];
  preferredPids?: readonly (number | undefined)[];
  label?: string;
  timeoutMs?: number;
}

export type MacOSWineWindowFocusResult =
  | { status: "focused"; pid: number }
  | { status: "timed-out" }
  | { status: "failed"; error: string }
  | { status: "superseded" }
  | { status: "unsupported" };

type ProcessActivationResult =
  | { status: "focused"; pid: number }
  | { status: "not-found" }
  | { status: "failed"; error: string };

interface MacOSWineWindowFocusDependencies {
  platform: NodeJS.Platform;
  now: () => number;
  delay: (timeoutMs: number) => Promise<void>;
  findProcesses: (roots: string[]) => Promise<ManagedWineProcess[]>;
  activateProcessIds: (pids: number[]) => Promise<ProcessActivationResult>;
  pollIntervalMs: number;
}

const DEFAULT_DEPENDENCIES: MacOSWineWindowFocusDependencies = {
  platform: process.platform,
  now: () => Date.now(),
  delay: (timeoutMs) => new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  findProcesses: find_managed_wine_processes,
  activateProcessIds: activate_macos_process_ids,
  pollIntervalMs: DEFAULT_FOCUS_POLL_INTERVAL_MS,
};

/**
 * Raises the first visible macOS Wine window that belongs to a specific prefix.
 *
 * A request is best effort and never blocks or fails the Wine launch itself.
 * A newer request for the same prefix supersedes the previous polling loop.
 */
export class MacOSWineWindowFocusManager {
  private readonly generations = new Map<string, number>();
  private readonly dependencies: MacOSWineWindowFocusDependencies;

  constructor(dependencies: Partial<MacOSWineWindowFocusDependencies> = {}) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
  }

  requestFocus(request: MacOSWineWindowFocusRequest, logger: Logger): void {
    void this.focus(request).then((result) => {
      const context = {
        prefixPath: path.resolve(request.prefixPath),
        label: request.label,
      };

      if (result.status === "focused") {
        logger.info("Wine window brought to foreground", {
          ...context,
          pid: result.pid,
        });
      } else if (result.status === "timed-out") {
        logger.warn("Wine window foreground request timed out", context);
      } else if (result.status === "failed") {
        logger.warn("Wine window foreground request failed", {
          ...context,
          error: result.error,
        });
      }
    }).catch((error) => {
      logger.warn("Wine window foreground request failed", {
        prefixPath: path.resolve(request.prefixPath),
        label: request.label,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  async focus(request: MacOSWineWindowFocusRequest): Promise<MacOSWineWindowFocusResult> {
    if (this.dependencies.platform !== "darwin") {
      return { status: "unsupported" };
    }

    const prefixPath = path.resolve(request.prefixPath);
    const generation = (this.generations.get(prefixPath) ?? 0) + 1;
    const startedAt = this.dependencies.now();
    const timeoutMs = Math.max(0, request.timeoutMs ?? DEFAULT_FOCUS_TIMEOUT_MS);
    const executableNames = normalize_executable_names(request.executableNames ?? []);
    const preferredPids = normalize_process_ids(request.preferredPids ?? []);

    this.generations.set(prefixPath, generation);

    while (this.dependencies.now() - startedAt <= timeoutMs) {
      if (this.generations.get(prefixPath) !== generation) {
        return { status: "superseded" };
      }

      let processes: ManagedWineProcess[];

      try {
        processes = await this.dependencies.findProcesses([prefixPath]);
      } catch (error) {
        this.clearGeneration(prefixPath, generation);
        return {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
      }

      if (this.generations.get(prefixPath) !== generation) {
        return { status: "superseded" };
      }

      const elapsedMs = this.dependencies.now() - startedAt;
      const processIds = focus_process_ids({
        processes,
        executableNames,
        preferredPids,
        includePrefixFallback: elapsedMs >= PREFIX_PROCESS_FALLBACK_DELAY_MS,
      });

      if (processIds.length > 0) {
        let activation: ProcessActivationResult;

        try {
          activation = await this.dependencies.activateProcessIds(
            processIds.slice(0, MAX_FOCUS_PROCESS_IDS),
          );
        } catch (error) {
          this.clearGeneration(prefixPath, generation);
          return {
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          };
        }

        if (activation.status === "focused") {
          this.clearGeneration(prefixPath, generation);
          return activation;
        }

        if (activation.status === "failed") {
          this.clearGeneration(prefixPath, generation);
          return activation;
        }
      }

      await this.dependencies.delay(this.dependencies.pollIntervalMs);
    }

    this.clearGeneration(prefixPath, generation);
    return { status: "timed-out" };
  }

  private clearGeneration(prefixPath: string, generation: number): void {
    if (this.generations.get(prefixPath) === generation) {
      this.generations.delete(prefixPath);
    }
  }
}

export function focus_process_ids(params: {
  processes: readonly ManagedWineProcess[];
  executableNames: readonly string[];
  preferredPids: readonly number[];
  includePrefixFallback: boolean;
}): number[] {
  const expectedProcessIds = params.processes
    .filter(({ command }) => params.executableNames.some((name) =>
      command_runs_windows_executable(command, name),
    ))
    .map(({ pid }) => pid);
  const fallbackProcessIds = params.includePrefixFallback
    ? params.processes.map(({ pid }) => pid)
    : [];

  return normalize_process_ids([
    ...params.preferredPids,
    ...expectedProcessIds,
    ...fallbackProcessIds,
  ]);
}

function normalize_executable_names(names: readonly string[]): string[] {
  return [...new Set(names
    .map((name) => path.basename(name.trim().replace(/\\/g, "/")))
    .filter(Boolean),
  )];
}

function normalize_process_ids(pids: readonly (number | undefined)[]): number[] {
  return [...new Set(pids.filter((pid): pid is number =>
    Number.isSafeInteger(pid) && Number(pid) > 1,
  ))];
}

function activate_macos_process_ids(pids: number[]): Promise<ProcessActivationResult> {
  if (pids.length === 0) {
    return Promise.resolve({ status: "not-found" });
  }

  const script = `
on run argv
  tell application "System Events"
    repeat with pidText in argv
      set targetPid to pidText as integer
      try
        tell first application process whose unix id is targetPid
          if (count of windows) > 0 then
            set frontmost to true
            try
              perform action "AXRaise" of window 1
            end try
            if frontmost then
              return "focused:" & (targetPid as text)
            end if
          end if
        end tell
      end try
    end repeat
  end tell

  return "not-found"
end run
`;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn("osascript", [
      "-e",
      script,
      "--",
      ...pids.map(String),
    ], {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const finish = (result: ProcessActivationResult) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ status: "failed", error: "AppleScript foreground request timed out." });
    }, APPLE_SCRIPT_TIMEOUT_MS);

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    child.once("error", (error) => {
      finish({ status: "failed", error: error.message });
    });
    child.once("close", (code) => {
      if (code !== 0) {
        finish({
          status: "failed",
          error: stderr.trim() || `osascript exited with code ${code ?? -1}.`,
        });
        return;
      }

      const match = stdout.trim().match(/^focused:(\d+)$/);

      if (match) {
        finish({ status: "focused", pid: Number.parseInt(match[1], 10) });
      } else {
        finish({ status: "not-found" });
      }
    });
  });
}

export const macOSWineWindowFocusManager = new MacOSWineWindowFocusManager();
