import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const releaseRoot = path.resolve(process.cwd(), "tests", "Release");
function argument_value(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
    });
  });
}

async function ensure_local_feed_is_ready() {
  const port = process.env.BDIH_UPDATE_TEST_PORT || "45678";
  const feedUrl = `http://127.0.0.1:${port}/`;

  try {
    const response = await fetch(feedUrl, { signal: AbortSignal.timeout(1_500) });
    if (response.ok) return;
  } catch {
    // The actionable error below is clearer than the raw network exception.
  }

  throw new Error(
    `Local update feed is not ready at ${feedUrl}. Run "pnpm update:test:serve" in a separate terminal first.`,
  );
}

async function main() {
  const requestedChannel = argument_value("--channel");
  const recordFileName = requestedChannel
    ? `last-build-${requestedChannel}.json`
    : "last-build.json";
  let lastBuild;

  if (process.argv.includes("--install")) {
    lastBuild = JSON.parse(await readFile(path.join(releaseRoot, recordFileName), "utf8"));
    await access(lastBuild.appPath);
  }

  const channel = requestedChannel || lastBuild?.channel || "stable";
  const productName = channel === "nightly"
    ? "BDIH Launcher Nightly Update Test"
    : "BDIH Launcher Update Test";
  const installPath = process.env.BDIH_UPDATE_TEST_APP_PATH
    ? path.resolve(process.env.BDIH_UPDATE_TEST_APP_PATH)
    : path.join(os.homedir(), "Applications", `${productName}.app`);

  if (lastBuild) {
    await mkdir(path.dirname(installPath), { recursive: true });
    await rm(installPath, { recursive: true, force: true });
    await run("ditto", [lastBuild.appPath, installPath]);
    process.stdout.write(`Installed isolated update test app: ${installPath}\n`);
  }

  await ensure_local_feed_is_ready();
  await access(installPath);
  await run("open", ["-n", installPath]);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write("Build and install first with: pnpm start:test -- --install\n");
  process.stderr.write("For Nightly use: pnpm start:test:nightly -- --install\n");
  process.exitCode = 1;
});
