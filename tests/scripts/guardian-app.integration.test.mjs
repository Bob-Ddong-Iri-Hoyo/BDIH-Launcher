import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(import.meta.url);
const ELECTRON_PATH = require("electron");
const PROCESS_TIMEOUT_MS = 20_000;

test("single-instance lock, startup recovery, and process-group-isolated crash Guardian work together", async () => {
  if (process.platform !== "darwin") {
    return;
  }

  const testRoot = await mkdtemp(path.join(os.tmpdir(), "bdih-guardian-app-"));
  const managedRoot = path.join(
    testRoot,
    "state",
    "stable-beta",
    "data",
  );
  const fakeWinePath = path.join(managedRoot, "wine");
  const environment = {
    ...process.env,
    BDIH_UPDATE_TEST_BUILD: "1",
    BDIH_UPDATE_TEST_ROOT: testRoot,
    BDIH_DEV_RESOURCE_ROOT: managedRoot,
    BDIH_TEST_CHANNEL: "stable",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
  };
  let primary;
  let orphanWine;
  let crashWine;

  try {
    await mkdir(managedRoot, { recursive: true });
    await copyFile("/bin/sleep", fakeWinePath);

    orphanWine = spawn(fakeWinePath, ["120"], {
      cwd: managedRoot,
      stdio: "ignore",
    });
    primary = spawn(ELECTRON_PATH, [REPOSITORY_ROOT], {
      cwd: REPOSITORY_ROOT,
      env: environment,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const primaryOutput = collect_process_output(primary);

    await wait_for_child_exit(orphanWine, PROCESS_TIMEOUT_MS, () => {
      return `Launcher output:\n${primaryOutput()}`;
    });
    const guardianProcess = await wait_for_guardian_process(primary.pid, PROCESS_TIMEOUT_MS);
    assert.ok(guardianProcess.pid > 0, "The primary launcher should own a native Guardian.");
    assert.notEqual(
      guardianProcess.processGroupId,
      primary.pid,
      "The Guardian must not share the launcher's process group.",
    );

    crashWine = spawn(fakeWinePath, ["120"], {
      cwd: managedRoot,
      stdio: "ignore",
    });
    await wait_for_condition(
      () => is_process_alive(crashWine.pid),
      2_000,
      "The managed fake Wine process did not start.",
    );

    const secondary = spawn(ELECTRON_PATH, [REPOSITORY_ROOT], {
      cwd: REPOSITORY_ROOT,
      env: environment,
      stdio: "ignore",
    });
    await wait_for_child_exit(secondary, 5_000);
    assert.equal(
      is_process_alive(crashWine.pid),
      true,
      "A secondary launcher must not run orphan recovery against the primary instance.",
    );

    // Simulate a VS Code or shell task teardown that kills the launcher's
    // complete foreground process group. The detached Guardian must survive,
    // observe Main exit, clean Wine, and then terminate itself.
    process.kill(-primary.pid, "SIGKILL");
    await wait_for_child_exit(primary, 5_000);
    await wait_for_child_exit(crashWine, PROCESS_TIMEOUT_MS);
    await wait_for_condition(
      () => !is_process_alive(guardianProcess.pid),
      PROCESS_TIMEOUT_MS,
      "The Guardian remained alive after completing crash cleanup.",
    );
    const guardianLog = await read_guardian_log(path.join(managedRoot, "logs"));
    assert.match(guardianLog, /event=ready ownerPid=\d+ roots=\d+/);
    assert.match(
      guardianLog,
      /event=cleanup trigger=(?:owner-exit|control-eof) detected=\d+ forced=\d+ remaining=0 result=0/,
    );
  } finally {
    terminate_process_group(primary);
    terminate_if_alive(orphanWine);
    terminate_if_alive(crashWine);
    await rm(testRoot, { recursive: true, force: true });
  }
});

async function read_guardian_log(logRoot) {
  const entries = await readdir(logRoot, { withFileTypes: true });
  const sessionDirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const sessionDirectory of sessionDirectories) {
    try {
      return await readFile(
        path.join(logRoot, sessionDirectory, "guardian.log"),
        "utf8",
      );
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw new Error(`No Guardian event log was created below ${logRoot}.`);
}

function collect_process_output(child) {
  let output = "";
  const append = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-12_000);
  };

  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  return () => output;
}

async function wait_for_guardian_process(ownerPid, timeoutMs) {
  let guardianProcess;

  await wait_for_condition(async () => {
    const processList = await read_process_list();
    const match = processList.find((entry) => (
      entry.parentPid === ownerPid
      && entry.command.includes("bdih-guardian")
      && entry.command.includes(`--owner-pid ${ownerPid}`)
    ));
    guardianProcess = match;
    return Boolean(guardianProcess);
  }, timeoutMs, "The launcher did not start its native Guardian.");

  return guardianProcess;
}

function read_process_list() {
  return new Promise((resolve, reject) => {
    const ps = spawn("/bin/ps", ["-axo", "pid=,ppid=,pgid=,command="], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    ps.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    ps.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    ps.once("error", reject);
    ps.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`ps failed: ${stderr.trim()}`));
        return;
      }

      resolve(stdout.split("\n").flatMap((line) => {
        const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
        return match
          ? [{
            pid: Number(match[1]),
            parentPid: Number(match[2]),
            processGroupId: Number(match[3]),
            command: match[4],
          }]
          : [];
      }));
    });
  });
}

function wait_for_child_exit(child, timeoutMs, describeFailure = () => "") {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(
        `Timed out waiting for PID ${child.pid} to exit. ${describeFailure()}`,
      ));
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function wait_for_condition(check, timeoutMs, failureMessage) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(failureMessage);
}

function is_process_alive(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function terminate_if_alive(child) {
  if (!child || !is_process_alive(child.pid)) {
    return;
  }

  try {
    process.kill(child.pid, "SIGKILL");
  } catch {
    // The child already exited between the liveness check and the signal.
  }
}

function terminate_process_group(child) {
  if (!child?.pid) {
    return;
  }

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // The detached launcher's process group has already exited.
  }
}
