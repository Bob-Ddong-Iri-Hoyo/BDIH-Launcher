import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_RELEASE_ROOT = path.join(ROOT, "tests", "Release");
const TEST_FEED_ROOT = path.join(TEST_RELEASE_ROOT, "feed");
const SUPPORTED_CHANNELS = ["stable", "beta", "nightly"];
const DEFAULT_VERSIONS = {
  stable: "1.0.0",
  beta: "1.1.0-beta.1",
  nightly: "1.1.0-nightly.1",
};
const VALUE_ARGUMENTS = new Set([
  "--channel",
  "--version",
  "--range",
  "--from",
  "--to",
  ...SUPPORTED_CHANNELS.map((channel) => `--${channel}`),
]);
const FLAG_ARGUMENTS = new Set(["--dry-run", "--help", "--publish-only"]);
const MAX_RANGE_SIZE = 100;

function parse_arguments(args) {
  const parsed = new Map();

  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];

    if (name === "--") {
      continue;
    }

    if (FLAG_ARGUMENTS.has(name)) {
      if (parsed.has(name)) {
        throw new Error(`Argument ${name} may only be specified once.`);
      }
      parsed.set(name, true);
      continue;
    }

    if (!VALUE_ARGUMENTS.has(name)) {
      throw new Error(`Unknown argument: ${name}`);
    }
    if (parsed.has(name)) {
      throw new Error(`Argument ${name} may only be specified once.`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Argument ${name} requires a value.`);
    }

    parsed.set(name, value);
    index += 1;
  }

  return parsed;
}

function parse_version(version) {
  const match = version.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/,
  );

  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4]?.split(".") ?? [],
    build: match[5]?.split(".") ?? [],
  };
}

function format_version({ core, prerelease, build }) {
  return `${core.join(".")}${prerelease.length ? `-${prerelease.join(".")}` : ""}${
    build.length ? `+${build.join(".")}` : ""
  }`;
}

export function validate_version(version, channel) {
  const parsed = parse_version(version);
  const prereleaseChannel = parsed.prerelease[0];

  if (channel === "stable" && prereleaseChannel) {
    throw new Error("Stable test builds must not use a prerelease version.");
  }

  if (channel !== "stable" && prereleaseChannel !== channel) {
    throw new Error(`${channel} test builds must use a ${channel} prerelease version.`);
  }
}

function split_range_expression(expression) {
  const separator = expression.includes("..") ? ".." : expression.includes("~") ? "~" : undefined;

  if (!separator) {
    return undefined;
  }

  const parts = expression.split(separator);
  if (parts.length !== 2 || parts.some((part) => !part)) {
    throw new Error(`Invalid version range: ${expression}`);
  }

  return parts;
}

function range_components(parsed) {
  return [
    ...parsed.core.map((value, index) => ({ group: "core", index, value, numeric: true })),
    ...parsed.prerelease.map((value, index) => ({
      group: "prerelease",
      index,
      value,
      numeric: /^\d+$/.test(value),
    })),
    ...parsed.build.map((value, index) => ({
      group: "build",
      index,
      value,
      numeric: /^\d+$/.test(value),
    })),
  ];
}

export function expand_version_expression(expression) {
  const range = split_range_expression(expression);

  if (!range) {
    parse_version(expression);
    return [expression];
  }

  const [fromVersion, toVersion] = range;
  const from = parse_version(fromVersion);
  const to = parse_version(toVersion);
  const fromComponents = range_components(from);
  const toComponents = range_components(to);

  if (fromComponents.length !== toComponents.length) {
    throw new Error(`Version range endpoints must have the same structure: ${expression}`);
  }

  const differences = fromComponents
    .map((component, index) => ({ from: component, to: toComponents[index] }))
    .filter(({ from: left, to: right }) => (
      left.group !== right.group || left.index !== right.index || String(left.value) !== String(right.value)
    ));

  if (differences.length === 0) {
    return [fromVersion];
  }

  if (
    differences.length !== 1
    || !differences[0].from.numeric
    || !differences[0].to.numeric
    || differences[0].from.group !== differences[0].to.group
  ) {
    throw new Error(
      `Version ranges must change exactly one numeric component: ${expression}`,
    );
  }

  const start = Number(differences[0].from.value);
  const end = Number(differences[0].to.value);
  const size = Math.abs(end - start) + 1;
  if (size > MAX_RANGE_SIZE) {
    throw new Error(`Version range may contain at most ${MAX_RANGE_SIZE} versions: ${expression}`);
  }

  const step = start <= end ? 1 : -1;
  const versions = [];

  for (let value = start; ; value += step) {
    const candidate = {
      core: [...from.core],
      prerelease: [...from.prerelease],
      build: [...from.build],
    };
    const target = differences[0].from;

    if (target.group === "core") candidate.core[target.index] = value;
    else if (target.group === "prerelease") candidate.prerelease[target.index] = String(value);
    else candidate.build[target.index] = String(value);

    versions.push(format_version(candidate));
    if (value === end) break;
  }

  return versions;
}

export function resolve_build_plan(args, env = process.env) {
  const parsed = parse_arguments(args);
  const channelExpressions = SUPPORTED_CHANNELS
    .filter((channel) => parsed.has(`--${channel}`))
    .map((channel) => ({ channel, expression: parsed.get(`--${channel}`) }));
  const singleChannelArguments = ["--channel", "--version", "--range", "--from", "--to"]
    .filter((name) => parsed.has(name));

  if (channelExpressions.length && singleChannelArguments.length) {
    throw new Error(
      `Channel range arguments cannot be combined with ${singleChannelArguments.join(", ")}.`,
    );
  }

  let expressions;
  if (channelExpressions.length) {
    expressions = channelExpressions;
  } else {
    const channel = parsed.get("--channel") || env.BDIH_TEST_CHANNEL || "stable";
    if (!SUPPORTED_CHANNELS.includes(channel)) {
      throw new Error(`Unsupported update test channel: ${channel}`);
    }

    const rangeExpression = parsed.get("--range");
    const from = parsed.get("--from");
    const to = parsed.get("--to");
    const version = parsed.get("--version");

    if ((from && !to) || (!from && to)) {
      throw new Error("Both --from and --to are required for a version range.");
    }

    const versionSelectors = [rangeExpression, from && to ? `${from}..${to}` : undefined, version]
      .filter(Boolean);
    if (versionSelectors.length > 1) {
      throw new Error("Use only one of --version, --range, or --from with --to.");
    }

    expressions = [{
      channel,
      expression: versionSelectors[0] || env.BDIH_TEST_VERSION || DEFAULT_VERSIONS[channel],
    }];
  }

  const builds = expressions.flatMap(({ channel, expression }) =>
    expand_version_expression(expression).map((version) => {
      validate_version(version, channel);
      return { channel, version };
    }),
  );

  return {
    builds,
    dryRun: parsed.has("--dry-run"),
    help: parsed.has("--help"),
    publishOnly: parsed.has("--publish-only"),
  };
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

async function publish_local_feed(buildOutput, channel) {
  await mkdir(TEST_FEED_ROOT, { recursive: true });
  let entries;

  try {
    entries = await readdir(buildOutput, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `Missing ${channel} update artifact at ${buildOutput}. Build it before selecting it.`,
      );
    }

    throw error;
  }

  const feedFiles = entries.filter((entry) => entry.isFile() && (
    entry.name.endsWith(".zip")
    || entry.name.endsWith(".zip.blockmap")
    || /(?:^|-)mac\.yml$/.test(entry.name)
  ));
  const expectedMetadata = channel === "stable" ? "latest-mac.yml" : `${channel}-mac.yml`;

  if (
    !feedFiles.some((entry) => entry.name.endsWith(".zip"))
    || !feedFiles.some((entry) => entry.name.endsWith(".zip.blockmap"))
    || !feedFiles.some((entry) => entry.name === expectedMetadata)
  ) {
    throw new Error(
      `Incomplete ${channel} update artifact at ${buildOutput}. Build it before selecting it.`,
    );
  }

  for (const entry of feedFiles) {
    await copyFile(path.join(buildOutput, entry.name), path.join(TEST_FEED_ROOT, entry.name));
  }
}

async function publish_test_artifact(context) {
  await publish_local_feed(context.buildOutput, context.channel);

  const { storageProfile, ...record } = context;
  const buildRecord = `${JSON.stringify(record, null, 2)}\n`;
  await Promise.all([
    writeFile(path.join(TEST_RELEASE_ROOT, "last-build.json"), buildRecord),
    writeFile(path.join(TEST_RELEASE_ROOT, `last-build-${context.channel}.json`), buildRecord),
    writeFile(path.join(TEST_RELEASE_ROOT, `last-build-${storageProfile}.json`), buildRecord),
  ]);
}

function build_context(channel, version) {
  const productName = channel === "nightly"
    ? "BDIH Launcher Nightly Update Test"
    : "BDIH Launcher Update Test";
  const storageProfile = channel === "nightly" ? "nightly" : "stable-beta";
  const buildOutput = path.join(TEST_RELEASE_ROOT, "builds", channel, version);

  return {
    version,
    channel,
    productName,
    appPath: path.join(buildOutput, "mac-arm64", `${productName}.app`),
    installPath: path.join(TEST_RELEASE_ROOT, "apps", storageProfile, `${productName}.app`),
    stateRoot: path.join(TEST_RELEASE_ROOT, "state", storageProfile),
    buildOutput,
    feedRoot: TEST_FEED_ROOT,
    updatePort: process.env.BDIH_UPDATE_TEST_PORT || "45678",
    storageProfile,
  };
}

async function build_test_artifact(channel, version, position, total) {
  const context = build_context(channel, version);
  const env = {
    ...process.env,
    BDIH_TEST_VERSION: version,
    BDIH_TEST_CHANNEL: channel,
    BDIH_TEST_OUTPUT_DIR: context.buildOutput,
    BDIH_UPDATE_TEST_BUILD: "1",
    UPDATE_CHANNEL: channel === "stable" ? "latest" : channel,
  };

  process.stdout.write(`\n[${position}/${total}] Packaging ${channel} ${version}\n`);
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
  await publish_test_artifact(context);

  process.stdout.write(`Test build ready: ${context.appPath}\n`);
}

function print_plan(builds) {
  process.stdout.write(`Update test artifact plan (${builds.length} build${builds.length === 1 ? "" : "s"}):\n`);
  for (const [index, build] of builds.entries()) {
    process.stdout.write(`  ${index + 1}. ${build.channel} ${build.version}\n`);
  }
}

function print_help() {
  process.stdout.write(`Usage:
  node scripts/build-update-test.mjs --channel stable --version 1.0.0
  node scripts/build-update-test.mjs --channel stable --range 1.0.0~1.0.9
  node scripts/build-update-test.mjs --from 1.0.0 --to 1.0.9 --channel stable
  node scripts/build-update-test.mjs --stable 1.0.0~1.0.9 --beta 1.1.0-beta.1~1.1.0-beta.9

Options:
  --stable <version-or-range>   Add Stable artifacts to a multi-channel build.
  --beta <version-or-range>     Add Beta artifacts to a multi-channel build.
  --nightly <version-or-range>  Add Nightly artifacts to a multi-channel build.
  --range <from~to>             Build one channel in ascending or descending order.
  --publish-only                Select existing artifacts as feed targets without building.
  --dry-run                     Validate and print the build plan without building.
`);
}

async function main() {
  const plan = resolve_build_plan(process.argv.slice(2));

  if (plan.help) {
    print_help();
    return;
  }

  print_plan(plan.builds);
  if (plan.dryRun) {
    return;
  }

  if (plan.publishOnly) {
    for (const build of plan.builds) {
      const context = build_context(build.channel, build.version);
      await publish_test_artifact(context);
      process.stdout.write(`Selected feed target: ${build.channel} ${build.version}\n`);
    }

    process.stdout.write(`\nLocal update feed: ${TEST_FEED_ROOT}\n`);
    return;
  }

  const buildEnv = {
    ...process.env,
    BDIH_UPDATE_TEST_BUILD: "1",
  };
  process.stdout.write("\nBuilding application source once for all test artifacts...\n");
  await run("pnpm", ["build"], buildEnv);

  for (const [index, build] of plan.builds.entries()) {
    await build_test_artifact(build.channel, build.version, index + 1, plan.builds.length);
  }

  process.stdout.write(`\nLocal update feed: ${TEST_FEED_ROOT}\n`);
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
