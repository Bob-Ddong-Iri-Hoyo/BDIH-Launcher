#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFile, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FINAL_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const BETA_TARGET_PATTERN = /^\d+\.\d+\.\d+-beta\.[1-9]\d*$/;
const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PROMOTION_SCHEMA_VERSION = 1;

export function resolve_staging_candidate(targetVersion, attemptValue) {
  const normalizedTarget = String(targetVersion ?? "").trim();
  const attempt = normalize_attempt(attemptValue);
  let channel;
  let version;

  if (FINAL_VERSION_PATTERN.test(normalizedTarget)) {
    channel = "stable";
    version = `${normalizedTarget}-rc.${attempt}`;
  } else if (BETA_TARGET_PATTERN.test(normalizedTarget)) {
    channel = "beta";
    version = `${normalizedTarget}.staging.${attempt}`;
  } else {
    throw new Error(
      `Target version must look like 1.0.0 or 1.0.0-beta.1. Got: ${normalizedTarget || "<empty>"}`,
    );
  }

  return {
    targetVersion: normalizedTarget,
    attempt,
    channel,
    channelLabel: channel === "stable" ? "Stable" : "Beta",
    version,
    tag: `v${version}+staging.${channel}`,
  };
}

export function validate_source_train_version(sourceVersion, targetVersion) {
  const source = String(sourceVersion ?? "").trim();
  const target = resolve_staging_candidate(targetVersion, 1);
  const expectedSourceVersion = target.targetVersion.split("-")[0];

  if (source !== expectedSourceVersion) {
    throw new Error(
      `Source package.json must stay at release train ${expectedSourceVersion} for target ${target.targetVersion}. Got: ${source || "<empty>"}`,
    );
  }

  return {
    sourceVersion: source,
    targetVersion: target.targetVersion,
    targetChannel: target.channel,
    releaseTrain: expectedSourceVersion,
  };
}

export async function prepare_production_package_version(packagePath, targetVersion) {
  const filePath = required_string(packagePath, "package path");
  const pkg = JSON.parse(await readFile(filePath, "utf8"));
  if (!is_record(pkg)) {
    throw new Error("package.json must contain a JSON object.");
  }

  const train = validate_source_train_version(pkg.version, targetVersion);
  pkg.version = train.targetVersion;
  await writeFile(filePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  return {
    ...train,
    packagedVersion: pkg.version,
  };
}

export function validate_candidate_metadata(value) {
  if (!is_record(value)) {
    throw new Error("Candidate metadata must be a JSON object.");
  }

  const resolved = resolve_staging_candidate(value.targetVersion, value.attempt);
  const candidate = {
    schemaVersion: number_or_default(value.schemaVersion, 1),
    version: required_string(value.version, "version"),
    targetVersion: resolved.targetVersion,
    attempt: resolved.attempt,
    tag: required_string(value.tag, "tag"),
    channel: required_string(value.channel, "channel"),
    sourceRepository: required_string(value.sourceRepository, "sourceRepository"),
    sourceCommit: required_string(value.sourceCommit, "sourceCommit").toLowerCase(),
    sourceRunId: required_string(value.sourceRunId, "sourceRunId"),
    sourceRunUrl: required_string(value.sourceRunUrl, "sourceRunUrl"),
    createdAt: required_string(value.createdAt, "createdAt"),
  };

  if (candidate.schemaVersion !== 1) {
    throw new Error(`Unsupported candidate metadata schema: ${candidate.schemaVersion}`);
  }
  if (candidate.version !== resolved.version) {
    throw new Error(`Candidate version must be ${resolved.version}. Got: ${candidate.version}`);
  }
  if (candidate.tag !== resolved.tag) {
    throw new Error(`Candidate tag must be ${resolved.tag}. Got: ${candidate.tag}`);
  }
  if (candidate.channel !== resolved.channel) {
    throw new Error(`Candidate channel must be ${resolved.channel}. Got: ${candidate.channel}`);
  }
  if (!REPOSITORY_PATTERN.test(candidate.sourceRepository)) {
    throw new Error(`Invalid source repository: ${candidate.sourceRepository}`);
  }
  if (!SOURCE_COMMIT_PATTERN.test(candidate.sourceCommit)) {
    throw new Error(`Invalid source commit: ${candidate.sourceCommit}`);
  }
  if (!/^\d+$/.test(candidate.sourceRunId)) {
    throw new Error(`Invalid source workflow run id: ${candidate.sourceRunId}`);
  }
  if (!is_https_url(candidate.sourceRunUrl)) {
    throw new Error(`Invalid source workflow run URL: ${candidate.sourceRunUrl}`);
  }
  if (!Number.isFinite(Date.parse(candidate.createdAt))) {
    throw new Error(`Invalid candidate creation date: ${candidate.createdAt}`);
  }

  if (candidate.channel === "beta") {
    if (value.promotedFrom !== undefined && value.promotedFrom !== null) {
      throw new Error("A Beta staging candidate cannot be promoted from another candidate.");
    }
    return { ...candidate, promotedFrom: null };
  }

  if (!is_record(value.promotedFrom)) {
    throw new Error("A Stable RC must record the Beta candidate it was promoted from.");
  }

  const promotedFrom = validate_candidate_metadata(value.promotedFrom);
  if (promotedFrom.channel !== "beta") {
    throw new Error("A Stable RC can only be promoted from a Beta staging candidate.");
  }
  if (promotedFrom.targetVersion.split("-")[0] !== candidate.targetVersion) {
    throw new Error(
      `Promoted Beta target ${promotedFrom.targetVersion} does not belong to Stable ${candidate.targetVersion}.`,
    );
  }
  if (promotedFrom.sourceRepository !== candidate.sourceRepository) {
    throw new Error("Beta and Stable candidates must come from the same source repository.");
  }

  return { ...candidate, promotedFrom };
}

export function assert_next_attempt(releases, targetVersion, attemptValue) {
  if (!Array.isArray(releases)) {
    throw new Error("Release list must be a JSON array.");
  }

  const resolved = resolve_staging_candidate(targetVersion, attemptValue);
  const attempts = releases.flatMap((release) => {
    if (!is_record(release) || release.isDraft === true || typeof release.tagName !== "string") {
      return [];
    }

    const attempt = attempt_from_tag(release.tagName, resolved);
    return attempt === undefined ? [] : [attempt];
  });
  const expectedAttempt = attempts.length === 0 ? 1 : Math.max(...attempts) + 1;

  if (resolved.attempt !== expectedAttempt) {
    throw new Error(
      `Attempt ${resolved.attempt} is not next for ${resolved.targetVersion}. Use attempt ${expectedAttempt}.`,
    );
  }

  return { ...resolved, expectedAttempt };
}

export function assert_current_candidate(releases, targetVersion, candidateTag) {
  if (!Array.isArray(releases)) {
    throw new Error("Release list must be a JSON array.");
  }

  const target = resolve_staging_candidate(targetVersion, 1);
  const candidates = releases.flatMap((release) => {
    if (!is_record(release) || release.isDraft === true || typeof release.tagName !== "string") {
      return [];
    }

    const attempt = attempt_from_tag(release.tagName, target);
    if (attempt === undefined) {
      return [];
    }

    const expectedPrerelease = target.channel === "beta";
    if (release.isPrerelease !== undefined && release.isPrerelease !== expectedPrerelease) {
      return [];
    }

    return [{ attempt, tag: release.tagName }];
  });

  if (candidates.length === 0) {
    throw new Error(`No published ${target.channel} candidate exists for ${target.targetVersion}.`);
  }

  const current = candidates.reduce((latest, candidate) => (
    candidate.attempt > latest.attempt ? candidate : latest
  ));
  if (candidateTag !== current.tag) {
    throw new Error(`${candidateTag} is superseded. Current candidate: ${current.tag}`);
  }

  return {
    ...resolve_staging_candidate(target.targetVersion, current.attempt),
    currentTag: current.tag,
  };
}

export function validate_candidate_lineage(candidateValue, promotedFromValue) {
  const candidate = validate_candidate_metadata(candidateValue);
  const promotedFrom = validate_candidate_metadata(promotedFromValue);

  if (candidate.channel !== "stable" || promotedFrom.channel !== "beta") {
    throw new Error("Lineage validation requires a Stable RC and its Beta parent.");
  }
  if (JSON.stringify(candidate.promotedFrom) !== JSON.stringify(promotedFrom)) {
    throw new Error("Stable RC lineage does not match the selected Beta release metadata.");
  }

  return { candidate, promotedFrom };
}

export async function create_promotion_provenance({
  candidate,
  productionTag,
  assetDirectory,
  createdAt = new Date().toISOString(),
}) {
  const normalizedCandidate = validate_candidate_metadata(candidate);

  const expectedProductionTag = `v${normalizedCandidate.targetVersion}`;
  if (productionTag !== expectedProductionTag) {
    throw new Error(`Production tag must be ${expectedProductionTag}. Got: ${productionTag}`);
  }

  const metadataName = update_metadata_name(normalizedCandidate.channel);
  const assets = await hash_assets(assetDirectory, new Set(), metadataName);
  assert_required_production_assets(assets, normalizedCandidate);

  return {
    schemaVersion: PROMOTION_SCHEMA_VERSION,
    candidate: normalizedCandidate,
    production: {
      tag: productionTag,
      version: normalizedCandidate.targetVersion,
      sourceCommit: normalizedCandidate.sourceCommit,
      createdAt,
    },
    assets,
  };
}

export async function validate_promotion_provenance({
  provenance,
  candidate,
  assetDirectory,
  productionTag,
}) {
  if (!is_record(provenance) || provenance.schemaVersion !== PROMOTION_SCHEMA_VERSION) {
    throw new Error("Invalid Production promotion provenance schema.");
  }

  const normalizedCandidate = validate_candidate_metadata(candidate);
  const recordedCandidate = validate_candidate_metadata(provenance.candidate);
  if (JSON.stringify(recordedCandidate) !== JSON.stringify(normalizedCandidate)) {
    throw new Error("Production draft candidate metadata does not match TestProduction.");
  }
  if (!is_record(provenance.production)) {
    throw new Error("Production promotion metadata is missing.");
  }
  if (provenance.production.tag !== productionTag) {
    throw new Error(`Production draft tag mismatch: ${provenance.production.tag}`);
  }
  if (provenance.production.version !== normalizedCandidate.targetVersion) {
    throw new Error("Production draft version does not match the candidate target.");
  }
  if (provenance.production.sourceCommit !== normalizedCandidate.sourceCommit) {
    throw new Error("Production draft source commit does not match the candidate.");
  }
  if (!Number.isFinite(Date.parse(String(provenance.production.createdAt ?? "")))) {
    throw new Error("Production draft creation date is invalid.");
  }
  if (!Array.isArray(provenance.assets)) {
    throw new Error("Production draft asset checksums are missing.");
  }

  const metadataName = update_metadata_name(normalizedCandidate.channel);
  const currentAssets = await hash_assets(
    assetDirectory,
    new Set(["promotion-source.json"]),
    metadataName,
  );
  const recordedAssets = [...provenance.assets]
    .map(normalize_asset_record)
    .sort((left, right) => left.name.localeCompare(right.name));
  assert_required_production_assets(recordedAssets, normalizedCandidate);

  if (JSON.stringify(recordedAssets) !== JSON.stringify(currentAssets)) {
    throw new Error("Production draft asset checksums do not match the approved build.");
  }

  return {
    candidate: normalizedCandidate,
    production: provenance.production,
    assets: currentAssets,
  };
}

async function run_cli(argv) {
  const [command, ...rest] = argv;
  const options = parse_options(rest);

  switch (command) {
    case "resolve": {
      const resolved = resolve_staging_candidate(options["target-version"], options.attempt);
      if (options["github-output"]) {
        await append_github_output(options["github-output"], resolved);
      } else {
        process.stdout.write(`${JSON.stringify(resolved, null, 2)}\n`);
      }
      return;
    }
    case "validate-source-train": {
      const result = validate_source_train_version(
        options["source-version"],
        options["target-version"],
      );
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "prepare-production-package": {
      const result = await prepare_production_package_version(
        required_option(options, "file"),
        options["target-version"],
      );
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "assert-next-attempt": {
      const releases = await read_json(options.releases);
      const result = assert_next_attempt(releases, options["target-version"], options.attempt);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "assert-current-candidate": {
      const releases = await read_json(options.releases);
      const result = assert_current_candidate(
        releases,
        options["target-version"],
        required_option(options, "candidate-tag"),
      );
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "validate-candidate": {
      const candidate = validate_candidate_metadata(await read_json(options.file));
      assert_expected(candidate, options);
      process.stdout.write(`${JSON.stringify(candidate, null, 2)}\n`);
      return;
    }
    case "validate-lineage": {
      const result = validate_candidate_lineage(
        await read_json(options.candidate),
        await read_json(options["promoted-from"]),
      );
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "field": {
      const candidate = validate_candidate_metadata(await read_json(options.file));
      const allowed = new Set([
        "version",
        "targetVersion",
        "attempt",
        "tag",
        "channel",
        "sourceRepository",
        "sourceCommit",
        "sourceRunId",
        "sourceRunUrl",
        "createdAt",
        "promotedFrom.tag",
        "promotedFrom.version",
        "promotedFrom.targetVersion",
        "promotedFrom.sourceCommit",
        "promotedFrom.sourceRunUrl",
      ]);
      if (!allowed.has(options.name)) {
        throw new Error(`Unsupported candidate field: ${options.name}`);
      }
      const value = options.name.startsWith("promotedFrom.")
        ? candidate.promotedFrom?.[options.name.slice("promotedFrom.".length)]
        : candidate[options.name];
      if (value === undefined || value === null) {
        throw new Error(`Candidate field is unavailable: ${options.name}`);
      }
      process.stdout.write(`${value}\n`);
      return;
    }
    case "create-provenance": {
      const provenance = await create_promotion_provenance({
        candidate: await read_json(options.candidate),
        productionTag: required_option(options, "production-tag"),
        assetDirectory: required_option(options, "asset-directory"),
      });
      await writeFile(required_option(options, "output"), `${JSON.stringify(provenance, null, 2)}\n`);
      return;
    }
    case "validate-provenance": {
      const result = await validate_promotion_provenance({
        provenance: await read_json(options.provenance),
        candidate: await read_json(options.candidate),
        assetDirectory: required_option(options, "asset-directory"),
        productionTag: required_option(options, "production-tag"),
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    default:
      throw new Error(`Unknown command: ${command || "<empty>"}`);
  }
}

async function append_github_output(outputPath, resolved) {
  const values = {
    version: resolved.version,
    target_version: resolved.targetVersion,
    attempt: resolved.attempt,
    channel: resolved.channel,
    channel_label: resolved.channelLabel,
    tag: resolved.tag,
  };
  const text = Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n");
  await appendFile(outputPath, `${text}\n`, "utf8");
}

function assert_expected(candidate, options) {
  const expected = {
    tag: options["expected-tag"],
    targetVersion: options["expected-target-version"],
    version: options["expected-version"],
    sourceCommit: options["expected-source-commit"]?.toLowerCase(),
    sourceRunId: options["expected-source-run-id"],
    channel: options["expected-channel"],
  };

  for (const [field, value] of Object.entries(expected)) {
    if (value !== undefined && String(candidate[field]) !== String(value)) {
      throw new Error(`Candidate ${field} mismatch. Expected ${value}, got ${candidate[field]}.`);
    }
  }
}

async function hash_assets(directory, ignoredNames = new Set(), metadataName = "latest-mac.yml") {
  const entries = await readdir(directory, { withFileTypes: true });
  const assets = [];

  for (const entry of entries) {
    if (
      !entry.isFile()
      || ignoredNames.has(entry.name)
      || !is_publishable_production_asset(entry.name, metadataName)
    ) {
      continue;
    }
    const filePath = path.join(directory, entry.name);
    const [contents, details] = await Promise.all([readFile(filePath), stat(filePath)]);
    assets.push({
      name: entry.name,
      sha256: createHash("sha256").update(contents).digest("hex"),
      size: details.size,
    });
  }

  return assets.sort((left, right) => left.name.localeCompare(right.name));
}

function is_publishable_production_asset(name, metadataName) {
  return name.endsWith(".dmg")
    || name.endsWith(".zip")
    || name.endsWith(".blockmap")
    || name === metadataName;
}

function assert_required_production_assets(assets, candidate) {
  const names = new Set(assets.map((asset) => asset.name));
  const metadataName = update_metadata_name(candidate.channel);
  const requiredPatterns = [
    { label: "DMG", test: (name) => name.endsWith(".dmg") },
    { label: "ZIP", test: (name) => name.endsWith(".zip") },
    { label: metadataName, test: (name) => name === metadataName },
    { label: "blockmap", test: (name) => name.endsWith(".blockmap") },
  ];

  for (const required of requiredPatterns) {
    if (![...names].some(required.test)) {
      throw new Error(`Production draft is missing ${required.label}.`);
    }
  }

  if (!assets.some((asset) => asset.name.endsWith(".zip") && asset.name.includes(candidate.targetVersion))) {
    throw new Error(`Production ZIP filename does not contain target version ${candidate.targetVersion}.`);
  }
}

function update_metadata_name(channel) {
  return channel === "stable" ? "latest-mac.yml" : "beta-mac.yml";
}

function normalize_asset_record(value) {
  if (!is_record(value)) {
    throw new Error("Invalid Production asset checksum record.");
  }
  const record = {
    name: required_string(value.name, "asset name"),
    sha256: required_string(value.sha256, "asset sha256").toLowerCase(),
    size: Number(value.size),
  };
  if (!/^[0-9a-f]{64}$/.test(record.sha256) || !Number.isSafeInteger(record.size) || record.size < 0) {
    throw new Error(`Invalid Production asset checksum for ${record.name}.`);
  }
  return record;
}

function attempt_from_tag(tag, resolved) {
  const prefix = resolved.channel === "stable"
    ? `v${escape_regexp(resolved.targetVersion)}-rc\\.`
    : `v${escape_regexp(resolved.targetVersion)}\\.staging\\.`;
  const suffix = `\\+staging\\.${resolved.channel}`;
  const match = new RegExp(`^${prefix}([1-9]\\d*)${suffix}$`).exec(tag);
  return match ? Number(match[1]) : undefined;
}

function normalize_attempt(value) {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) {
    throw new Error(`Attempt must be a positive integer. Got: ${text || "<empty>"}`);
  }
  const attempt = Number(text);
  if (!Number.isSafeInteger(attempt)) {
    throw new Error(`Attempt is too large: ${text}`);
  }
  return attempt;
}

function parse_options(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith("--")) {
      throw new Error(`Unexpected argument: ${key}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    options[key.slice(2)] = value;
    index += 1;
  }
  return options;
}

async function read_json(filePath) {
  return JSON.parse(await readFile(required_option({ filePath }, "filePath"), "utf8"));
}

function required_option(options, name) {
  const value = options[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing --${name}.`);
  }
  return value;
}

function required_string(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Candidate ${label} must be a non-empty string.`);
  }
  return value.trim();
}

function number_or_default(value, fallback) {
  return value === undefined ? fallback : Number(value);
}

function is_record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function is_https_url(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function escape_regexp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  run_cli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
