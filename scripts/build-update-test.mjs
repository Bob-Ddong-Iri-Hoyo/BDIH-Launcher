import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_RELEASE_ROOT = path.join(ROOT, "tests", "Release");
const TEST_FEED_ROOT = path.join(TEST_RELEASE_ROOT, "feed");
const SUPPORTED_CHANNELS = new Set(["stable", "beta", "nightly"]);
const DEFAULT_VERSIONS = {
  stable: "1.0.0",
  beta: "1.1.0-beta.1",
  nightly: "1.1.0-nightly.1",
};

function argument_value(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function validate_version(version, channel) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  const prerelease = version.split("-")[1]?.split(".")[0];
  if (channel === "stable" && prerelease) {
    throw new Error("Stable test builds must not use a prerelease version.");
  }

  if (channel !== "stable" && prerelease !== channel) {
    throw new Error(`${channel} test builds must use a ${channel} prerelease version.`);
  }
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
    });
  });
}

async function publish_local_feed(buildOutput) {
  await mkdir(TEST_FEED_ROOT, { recursive: true });
  const entries = await readdir(buildOutput, { withFileTypes: true });
  const feedFiles = entries.filter((entry) => entry.isFile() && (
    entry.name.endsWith(".zip")
    || entry.name.endsWith(".zip.blockmap")
    || /(?:^|-)mac\.yml$/.test(entry.name)
  ));

  for (const entry of feedFiles) {
    await copyFile(path.join(buildOutput, entry.name), path.join(TEST_FEED_ROOT, entry.name));
  }
}

async function main() {
  const channel = argument_value("--channel") || process.env.BDIH_TEST_CHANNEL || "stable";

  if (!SUPPORTED_CHANNELS.has(channel)) {
    throw new Error(`Unsupported update test channel: ${channel}`);
  }
  const version = argument_value("--version") || process.env.BDIH_TEST_VERSION || DEFAULT_VERSIONS[channel];
  validate_version(version, channel);

  const productName = channel === "nightly"
    ? "BDIH Launcher Nightly Update Test"
    : "BDIH Launcher Update Test";
  const storageProfile = channel === "nightly" ? "nightly" : "stable-beta";
  const buildOutput = path.join(TEST_RELEASE_ROOT, "builds", channel, version);
  const appPath = path.join(buildOutput, "mac-arm64", `${productName}.app`);
  const installPath = path.join(TEST_RELEASE_ROOT, "apps", storageProfile, `${productName}.app`);
  const stateRoot = path.join(TEST_RELEASE_ROOT, "state", storageProfile);
  const updatePort = process.env.BDIH_UPDATE_TEST_PORT || "45678";
  const env = {
    ...process.env,
    BDIH_TEST_VERSION: version,
    BDIH_TEST_CHANNEL: channel,
    BDIH_TEST_OUTPUT_DIR: buildOutput,
    BDIH_UPDATE_TEST_BUILD: "1",
    UPDATE_CHANNEL: channel === "stable" ? "latest" : channel,
  };

  await run("pnpm", ["build"], env);
  await run("pnpm", [
    "exec",
    "electron-builder",
    "--config",
    "electron-builder.test.config.cjs",
    "--mac",
    "--arm64",
    "--publish",
    "never",
  ], env);
  await publish_local_feed(buildOutput);
  const buildRecord = `${JSON.stringify({
    version,
    channel,
    productName,
    appPath,
    installPath,
    stateRoot,
    buildOutput,
    feedRoot: TEST_FEED_ROOT,
    updatePort,
  }, null, 2)}\n`;
  await Promise.all([
    writeFile(path.join(TEST_RELEASE_ROOT, "last-build.json"), buildRecord),
    writeFile(path.join(TEST_RELEASE_ROOT, `last-build-${channel}.json`), buildRecord),
    writeFile(path.join(TEST_RELEASE_ROOT, `last-build-${storageProfile}.json`), buildRecord),
  ]);

  process.stdout.write(`\nTest build ready: ${appPath}\n`);
  process.stdout.write(`Local update feed: ${TEST_FEED_ROOT}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
