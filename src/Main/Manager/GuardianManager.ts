import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { is_packaged_environment } from "../Environment/AppPaths";
import { logManager } from "./LogManager";

const GUARDIAN_READY_TIMEOUT_MS = 3000;
const GUARDIAN_STOP_TIMEOUT_MS = 2000;
const GUARDIAN_RESTART_DELAY_MS = 250;
const GUARDIAN_MAX_RESTARTS = 3;

export type GuardianStatus =
  | "inactive"
  | "starting"
  | "watching"
  | "stopping"
  | "stopped"
  | "error"
  | "unsupported";

interface GuardianProcess {
  child: ChildProcessWithoutNullStreams;
  roots: string[];
  expectedExit: boolean;
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

type SpawnGuardian = typeof spawn;

/**
 * Owns the native crash Guardian outside ProcessManager's lifecycle.
 *
 * The Guardian runs in a separate process group and watches both its private
 * stdin pipe and the Electron Main PID. A normal BDIH shutdown writes CLEAN
 * after Wine cleanup. A crash, owner exit, or termination signal makes the
 * native process remove Wine processes under the managed roots before it exits.
 */
export class GuardianManager {
  private readonly logger = logManager.createLogger("GuardianManager");
  private current?: GuardianProcess;
  private lastRoots: string[] = [];
  private status: GuardianStatus = process.platform === "darwin"
    ? "inactive"
    : "unsupported";
  private pendingOperation: Promise<void> = Promise.resolve();
  private shutdownRequested = false;
  private restartAttempts = 0;

  constructor(
    private readonly spawnGuardian: SpawnGuardian = spawn,
    private readonly executablePath = resolve_guardian_executable_path(),
  ) {}

  start(roots: string[]): Promise<void> {
    return this.enqueue(async () => {
      if (process.platform !== "darwin") {
        this.status = "unsupported";
        return;
      }

      const normalizedRoots = normalize_guardian_roots(roots);
      if (
        this.current
        && this.current.child.exitCode === null
        && arrays_are_equal(this.current.roots, normalizedRoots)
      ) {
        return;
      }

      this.shutdownRequested = false;
      this.restartAttempts = 0;
      try {
        await this.replaceGuardian(normalizedRoots);
      } catch (error) {
        this.status = this.current && this.current.child.exitCode === null
          ? "watching"
          : "error";
        throw error;
      }
    });
  }

  updateRoots(roots: string[]): Promise<void> {
    // Keep every root used during this launcher lifetime. Wine that started
    // under an old data root can still be alive after a preference change.
    return this.start([...this.lastRoots, ...roots]);
  }

  disarm(): Promise<void> {
    return this.enqueue(async () => {
      this.shutdownRequested = true;
      this.restartAttempts = GUARDIAN_MAX_RESTARTS;
      const current = this.current;
      this.current = undefined;
      this.status = current ? "stopping" : "stopped";

      if (current) {
        await this.stopGuardian(current, true);
      }

      this.status = "stopped";
      this.logger.info("BDIH Guardian disarmed after Wine cleanup");
    });
  }

  getStatus(): GuardianStatus {
    return this.status;
  }

  getPid(): number | undefined {
    return this.current?.child.pid;
  }

  private async replaceGuardian(roots: string[]): Promise<void> {
    const previous = this.current;
    this.status = "starting";
    const next = await this.spawnAndWaitForReady(roots);

    this.current = next;
    this.lastRoots = roots;
    this.status = "watching";
    this.logger.info("BDIH Guardian is watching the launcher", {
      pid: next.child.pid,
      roots,
    });

    if (previous) {
      await this.stopGuardian(previous, true);
    }
  }

  private async spawnAndWaitForReady(roots: string[]): Promise<GuardianProcess> {
    if (!this.executablePath || !existsSync(this.executablePath)) {
      throw new Error(
        `BDIH Guardian executable is missing: ${this.executablePath ?? "<unsupported>"}`
        + " Run pnpm build:guardian before starting the launcher.",
      );
    }

    const child = this.spawnGuardian(
      this.executablePath,
      [
        "--owner-pid",
        String(process.pid),
        ...roots.flatMap((root) => ["--root", root]),
        "--event-log",
        path.join(logManager.getSessionDir(), "guardian.log"),
      ],
      {
        cwd: path.dirname(this.executablePath),
        // Keep the Guardian outside the launcher's terminal/process group.
        // VS Code and shell task teardown may signal that whole group; the
        // Guardian must survive long enough to observe Main's pipe/PID exit.
        detached: true,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      },
    ) as ChildProcessWithoutNullStreams;
    const guardian: GuardianProcess = {
      child,
      roots,
      expectedExit: false,
      exit: new Promise((resolve) => {
        child.once("exit", (code, signal) => resolve({ code, signal }));
      }),
    };

    child.stderr.on("data", (chunk: Buffer) => {
      const message = chunk.toString().trim();
      if (message) {
        this.logger.warn("BDIH Guardian stderr", message);
      }
    });
    child.stdin.on("error", (error) => {
      if (!guardian.expectedExit) {
        this.logger.warn("BDIH Guardian control pipe failed", error);
      }
    });
    child.once("exit", (code, signal) => {
      this.handleGuardianExit(guardian, code, signal);
    });

    await wait_for_guardian_ready(child);
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `BDIH Guardian exited during startup with ${child.exitCode ?? child.signalCode ?? "unknown"}.`,
      );
    }
    return guardian;
  }

  private handleGuardianExit(
    guardian: GuardianProcess,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    if (this.current !== guardian || guardian.expectedExit) {
      return;
    }

    this.current = undefined;
    this.status = "error";
    this.logger.error("BDIH Guardian exited unexpectedly", {
      pid: guardian.child.pid,
      code,
      signal,
    });

    if (
      this.shutdownRequested
      || this.restartAttempts >= GUARDIAN_MAX_RESTARTS
      || this.lastRoots.length === 0
    ) {
      return;
    }

    this.scheduleRestart();
  }

  private scheduleRestart(): void {
    if (
      this.shutdownRequested
      || this.current
      || this.restartAttempts >= GUARDIAN_MAX_RESTARTS
      || this.lastRoots.length === 0
    ) {
      return;
    }

    this.restartAttempts += 1;
    const restartAttempt = this.restartAttempts;
    const timer = setTimeout(() => {
      void this.enqueue(async () => {
        if (this.shutdownRequested || this.current) {
          return;
        }

        this.logger.warn("Restarting BDIH Guardian", {
          attempt: restartAttempt,
          maximum: GUARDIAN_MAX_RESTARTS,
        });
        try {
          await this.replaceGuardian(this.lastRoots);
        } catch (error) {
          this.status = "error";
          this.logger.error("Failed to restart BDIH Guardian", error);
          this.scheduleRestart();
        }
      });
    }, GUARDIAN_RESTART_DELAY_MS);
    timer.unref();
  }

  private async stopGuardian(
    guardian: GuardianProcess,
    cleanShutdown: boolean,
  ): Promise<void> {
    guardian.expectedExit = true;

    if (guardian.child.exitCode !== null || guardian.child.signalCode !== null) {
      return;
    }

    if (cleanShutdown) {
      guardian.child.stdin.end("CLEAN\n");
    } else {
      guardian.child.stdin.end();
    }

    const exited = await wait_for_guardian_exit(
      guardian.exit,
      GUARDIAN_STOP_TIMEOUT_MS,
    );
    if (!exited && guardian.child.exitCode === null && guardian.child.signalCode === null) {
      guardian.child.kill("SIGKILL");
      await guardian.exit;
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.pendingOperation.then(operation);
    this.pendingOperation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function resolve_guardian_executable_path(): string | undefined {
  if (process.platform !== "darwin") {
    return undefined;
  }

  return is_packaged_environment()
    ? path.join(process.resourcesPath, "native", "bdih-guardian")
    : path.resolve(process.cwd(), "build", "native", "bdih-guardian");
}

function normalize_guardian_roots(roots: string[]): string[] {
  const normalized = [...new Set(roots
    .map((root) => root.trim())
    .filter(Boolean)
    .map((root) => path.resolve(expand_user_home_path(root))),
  )];

  if (normalized.length === 0) {
    throw new Error("BDIH Guardian requires at least one managed root.");
  }
  for (const root of normalized) {
    if (root === path.parse(root).root) {
      throw new Error(`BDIH Guardian refuses to manage a filesystem root: ${root}`);
    }
  }
  return normalized;
}

function expand_user_home_path(targetPath: string): string {
  if (targetPath === "~") {
    return process.env.HOME ?? targetPath;
  }
  if (targetPath.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", targetPath.slice(2));
  }
  return targetPath;
}

function arrays_are_equal(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function wait_for_guardian_ready(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = "";
    let settled = false;
    const finish = (operation: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      child.removeListener("error", on_error);
      child.removeListener("exit", on_exit);
      child.stdout.removeListener("data", on_data);
      operation();
    };
    const timeout = setTimeout(() => {
      finish(() => reject(new Error("Timed out waiting for BDIH Guardian readiness.")));
    }, GUARDIAN_READY_TIMEOUT_MS);
    const on_error = (error: Error) => finish(() => reject(error));
    const on_exit = (code: number | null, signal: NodeJS.Signals | null) => {
      finish(() => reject(new Error(
        `BDIH Guardian exited before readiness with ${code ?? signal ?? "unknown"}.`,
      )));
    };
    const on_data = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes("READY ")) {
        finish(resolve);
      }
    };

    child.once("error", on_error);
    child.once("exit", on_exit);
    child.stdout.on("data", on_data);
  });
}

function wait_for_guardian_exit(
  exit: GuardianProcess["exit"],
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => finish(false), timeoutMs);
    void exit.then(() => finish(true));
  });
}

export const guardianManager = new GuardianManager();
