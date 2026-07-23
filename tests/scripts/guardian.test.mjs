import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test, { before } from "node:test";

const root = path.resolve(import.meta.dirname, "..", "..");
const guardianPath = path.join(root, "build", "native", "bdih-guardian");
const buildScriptPath = path.join(root, "scripts", "build-guardian.mjs");
const isDarwin = process.platform === "darwin";

function wait_for_exit(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for child process exit."));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

function wait_for_ready(child, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for Guardian READY."));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("READY ")) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

async function create_fixture() {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "bdih-guardian-test-"));
  const managedRoot = path.join(fixtureRoot, "managed");
  const fakeWinePath = path.join(managedRoot, "wine");
  await mkdir(managedRoot, { recursive: true });
  await copyFile("/bin/sleep", fakeWinePath);
  return { fixtureRoot, managedRoot, fakeWinePath };
}

function spawn_guardian(managedRoot) {
  return spawn(guardianPath, [
    "--owner-pid",
    String(process.pid),
    "--root",
    managedRoot,
  ], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function process_is_alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

before(async () => {
  if (!isDarwin) {
    return;
  }

  const build = spawn(process.execPath, [buildScriptPath], {
    cwd: root,
    stdio: "inherit",
  });
  const result = await wait_for_exit(build, 30_000);
  assert.equal(result.code, 0);
});

test("clean shutdown disarms Guardian without terminating managed Wine", {
  skip: !isDarwin,
}, async () => {
  const fixture = await create_fixture();
  const wine = spawn(fixture.fakeWinePath, ["60"], {
    cwd: fixture.managedRoot,
    stdio: "ignore",
  });
  const guardian = spawn_guardian(fixture.managedRoot);

  try {
    await wait_for_ready(guardian);
    guardian.stdin.end("CLEAN\n");
    const guardianResult = await wait_for_exit(guardian);

    assert.equal(guardianResult.code, 0);
    assert.equal(process_is_alive(wine.pid), true);
  } finally {
    wine.kill("SIGKILL");
    guardian.kill("SIGKILL");
    await rm(fixture.fixtureRoot, { recursive: true, force: true });
  }
});

test("control pipe EOF makes Guardian terminate managed Wine", {
  skip: !isDarwin,
}, async () => {
  const fixture = await create_fixture();
  const wine = spawn(fixture.fakeWinePath, ["60"], {
    cwd: fixture.managedRoot,
    stdio: "ignore",
  });
  const guardian = spawn_guardian(fixture.managedRoot);

  try {
    await wait_for_ready(guardian);
    guardian.stdin.end();
    const guardianResult = await wait_for_exit(guardian);

    assert.equal(guardianResult.code, 0);
    assert.equal(process_is_alive(wine.pid), false);
  } finally {
    wine.kill("SIGKILL");
    guardian.kill("SIGKILL");
    await rm(fixture.fixtureRoot, { recursive: true, force: true });
  }
});
