import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = path.join(root, "tests", "Release");
const supportedChannels = new Set(["stable", "beta", "nightly"]);

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

async function ensure_local_feed_is_ready(recordedPort) {
  const port = process.env.BDIH_UPDATE_TEST_PORT || recordedPort || "45678";
  const feedUrl = `http://127.0.0.1:${port}/`;

  try {
    const response = await fetch(feedUrl, { signal: AbortSignal.timeout(1_500) });
    if (response.ok) return;
  } catch {
    // The actionable error below is clearer than the raw network exception.
  }

  throw new Error(
    `Local update feed is not ready at ${feedUrl}. Run "pnpm update:test:serve -- --port ${port}" in a separate terminal first.`,
  );
}

async function main() {
  const requestedChannel = argument_value("--channel");

  if (requestedChannel && !supportedChannels.has(requestedChannel)) {
    throw new Error(`Unsupported update test channel: ${requestedChannel}`);
  }

  const shouldInstall = process.argv.includes("--install") || process.argv.includes("--install-only");
  const shouldOpen = !process.argv.includes("--install-only") && !process.argv.includes("--reveal");
  const shouldReveal = process.argv.includes("--reveal");
  const recordFileName = requestedChannel
    ? `last-build-${requestedChannel}.json`
    : "last-build-stable-beta.json";
  let lastBuild;

  if (shouldInstall) {
    lastBuild = JSON.parse(await readFile(path.join(releaseRoot, recordFileName), "utf8"));
    await access(lastBuild.appPath);
  } else if (shouldOpen) {
    try {
      lastBuild = JSON.parse(await readFile(path.join(releaseRoot, recordFileName), "utf8"));
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
  }

  const channel = requestedChannel || lastBuild?.channel || "stable";
  const productName = channel === "nightly"
    ? "BDIH Launcher Nightly Update Test"
    : "BDIH Launcher Update Test";
  const storageProfile = channel === "nightly" ? "nightly" : "stable-beta";
  const installPath = path.join(releaseRoot, "apps", storageProfile, `${productName}.app`);

  if (shouldInstall && lastBuild) {
    await mkdir(path.dirname(installPath), { recursive: true });
    await rm(installPath, { recursive: true, force: true });
    await run("ditto", [lastBuild.appPath, installPath]);
    process.stdout.write(`Installed isolated update test app: ${installPath}\n`);
  }

  await access(installPath);

  if (shouldReveal) {
    await run("open", ["-R", installPath]);
    return;
  }

  if (shouldOpen) {
    await ensure_local_feed_is_ready(lastBuild?.updatePort);
    await run("open", ["-n", installPath]);
  } else {
    process.stdout.write(`Finder app: ${installPath}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write("Build and install first with: pnpm install:test\n");
  process.stderr.write("For Nightly use: pnpm install:test:nightly\n");
  process.exitCode = 1;
});
