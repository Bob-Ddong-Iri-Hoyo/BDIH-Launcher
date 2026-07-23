import { ChildProcess, spawn } from "child_process";

export interface ParamRunProgramArgument {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  onLog?: (data: string) => void;
  onError?: (data: string) => void;
}

export interface ParamRunProgramReturn {
  pid?: number;
  Stop: () => Promise<void>;
  done: Promise<number>;
}

function wait_for_child_exit(child: ChildProcess, done: Promise<number>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return Promise.race([
    done.then(() => undefined),
    new Promise<void>((resolve) => windowless_timeout(resolve, 1000)),
  ]);
}

function windowless_timeout(resolve: () => void, timeoutMs: number) {
  return setTimeout(resolve, timeoutMs);
}

function kill_process_tree(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  if (process.platform === "win32") {
    return new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });

      killer.on("close", () => resolve());
      killer.on("error", () => {
        child.kill("SIGKILL");
        resolve();
      });
    });
  }

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }

  return Promise.resolve();
}

export function runProgram(param: ParamRunProgramArgument): ParamRunProgramReturn {
  const combinedEnv = {
    ...process.env,
    ...param.env,
  };
  const child: ChildProcess = spawn(param.command, param.args || [], {
    cwd: param.cwd,
    env: combinedEnv,
    shell: false,
    detached: process.platform !== "win32",
    windowsHide: true,
  });

  child.stdout?.on("data", (data: Buffer) => {
    param.onLog?.(data.toString());
  });

  child.stderr?.on("data", (data: Buffer) => {
    param.onError?.(data.toString());
  });

  const done = new Promise<number>((resolve, reject) => {
    child.on("close", (code) => {
      resolve(code ?? -1);
    });
    child.on("error", (err) => {
      reject(err);
    });
  });

  return {
    pid: child.pid,
    done,
    Stop: async () => {
      await kill_process_tree(child);
      await wait_for_child_exit(child, done);
    },
  };
}
