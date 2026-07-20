import { spawn } from "child_process";
import path from "path";

const COMMAND_CAPTURE_TIMEOUT_MS = 5000;
const GRACEFUL_TERMINATION_WAIT_MS = 500;
const FORCED_TERMINATION_WAIT_MS = 200;

export interface ManagedWineProcessCleanupResult {
  detectedPids: number[];
  terminatedPids: number[];
  remainingPids: number[];
}

export interface ManagedWineProcess {
  pid: number;
  command: string;
}

export function is_wine_host_process_command(command: string): boolean {
  const normalized = command.trim();

  if (/^[A-Za-z]:[\\/]/.test(normalized)) {
    return true;
  }

  const executable = normalized.split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  return /(^|[/\\])wine(?:64)?(?:-preloader)?$/.test(executable) ||
    /(^|[/\\])wineserver$/.test(executable) ||
    /(^|[/\\])wineboot$/.test(executable);
}

export async function find_managed_wine_process_ids(roots: string[]): Promise<number[]> {
  return (await find_managed_wine_processes(roots)).map(({ pid }) => pid);
}

export async function find_managed_wine_processes(roots: string[]): Promise<ManagedWineProcess[]> {
  if (process.platform === "win32") {
    return [];
  }

  const normalizedRoots = normalize_roots(roots);

  if (normalizedRoots.length === 0) {
    return [];
  }

  const processCommands = parse_process_commands(await capture_command("/bin/ps", [
    "-axo",
    "pid=,command=",
  ])).filter(({ pid, command }) =>
    pid !== process.pid && is_wine_host_process_command(command),
  );

  if (processCommands.length === 0) {
    return [];
  }

  const lsofPath = process.platform === "darwin" ? "/usr/sbin/lsof" : "lsof";
  const lsofOutput = await capture_command(lsofPath, [
    "-n",
    "-Fpn",
    "-a",
    "-p",
    processCommands.map(({ pid }) => pid).join(","),
    "-d",
    "cwd,txt",
  ]);
  const pidsWithManagedFiles = process_ids_with_paths_in_roots(lsofOutput, normalizedRoots);

  return processCommands.filter(({ pid }) => pidsWithManagedFiles.has(pid));
}

export async function has_managed_wine_executable_process(
  roots: string[],
  executableNames: readonly string[],
): Promise<boolean> {
  if (executableNames.length === 0) {
    return false;
  }

  const processes = await find_managed_wine_processes(roots);

  return processes.some(({ command }) =>
    executableNames.some((executableName) =>
      command_runs_windows_executable(command, executableName),
    ),
  );
}

export function command_runs_windows_executable(
  command: string,
  executableName: string,
): boolean {
  const normalizedCommand = command.trim().replace(/\\/g, "/").toLowerCase();
  const normalizedExecutableName = executableName.trim().replace(/\\/g, "/").toLowerCase();

  if (!normalizedExecutableName || normalizedExecutableName.includes("/")) {
    return false;
  }

  const executableToken = `/${normalizedExecutableName}`;
  const executableIndex = normalizedCommand.indexOf(executableToken);

  if (executableIndex >= 0) {
    const trailingCharacter = normalizedCommand[executableIndex + executableToken.length];
    return trailingCharacter === undefined || /\s/.test(trailingCharacter);
  }

  if (!normalizedCommand.startsWith(normalizedExecutableName)) {
    return false;
  }

  const trailingCharacter = normalizedCommand[normalizedExecutableName.length];
  return trailingCharacter === undefined || /\s/.test(trailingCharacter);
}

export async function terminate_managed_wine_processes(
  roots: string[],
): Promise<ManagedWineProcessCleanupResult> {
  const detectedPids = await find_managed_wine_process_ids(roots);

  signal_processes(detectedPids, "SIGTERM");
  await delay(GRACEFUL_TERMINATION_WAIT_MS);

  const gracefulRemaining = detectedPids.filter(is_process_alive);
  const newlyDetected = await find_managed_wine_process_ids(roots);
  const forceCandidates = unique_pids([...gracefulRemaining, ...newlyDetected]);

  signal_processes(forceCandidates, "SIGKILL");
  await delay(FORCED_TERMINATION_WAIT_MS);

  const allDetectedPids = unique_pids([...detectedPids, ...newlyDetected]);
  const remainingPids = unique_pids([
    ...forceCandidates.filter(is_process_alive),
    ...await find_managed_wine_process_ids(roots),
  ]);

  return {
    detectedPids: allDetectedPids,
    terminatedPids: allDetectedPids.filter((pid) => !remainingPids.includes(pid)),
    remainingPids,
  };
}

function parse_process_commands(output: string): ManagedWineProcess[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(.+)$/);

    if (!match) {
      return [];
    }

    const pid = Number.parseInt(match[1], 10);
    return Number.isSafeInteger(pid) && pid > 1
      ? [{ pid, command: match[2] }]
      : [];
  });
}

function process_ids_with_paths_in_roots(output: string, roots: string[]): Set<number> {
  const matches = new Set<number>();
  let currentPid: number | undefined;

  for (const field of output.split(/\r?\n/)) {
    if (field.startsWith("p")) {
      const pid = Number.parseInt(field.slice(1), 10);
      currentPid = Number.isSafeInteger(pid) ? pid : undefined;
      continue;
    }

    if (!currentPid || !field.startsWith("n")) {
      continue;
    }

    const processPath = field.slice(1);
    if (roots.some((root) => path_is_within_root(root, processPath))) {
      matches.add(currentPid);
    }
  }

  return matches;
}

function normalize_roots(roots: string[]): string[] {
  return [...new Set(roots
    .map((root) => root.trim())
    .filter(Boolean)
    .map((root) => path.resolve(expand_user_home_path(root))),
  )];
}

function path_is_within_root(root: string, targetPath: string): boolean {
  const normalizedTarget = path.resolve(targetPath.replace(/ \(deleted\)$/, ""));
  const relativePath = path.relative(root, normalizedTarget);

  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
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

function capture_command(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(output);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish();
    }, COMMAND_CAPTURE_TIMEOUT_MS);

    child.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });
    child.once("error", finish);
    child.once("close", finish);
  });
}

function signal_processes(pids: number[], signal: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      // The process may have already exited between discovery and signaling.
    }
  }
}

function is_process_alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function unique_pids(pids: number[]): number[] {
  return [...new Set(pids)].sort((left, right) => left - right);
}

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}
