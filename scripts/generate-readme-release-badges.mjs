#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const GITHUB_API_URL = "https://api.github.com";
const INSTALLER_ASSET_PATTERN = /\.(?:dmg|zip)$/i;
const FINAL_RELEASE_PATTERN = /^v?\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/;
const BETA_RELEASE_PATTERN = /^v?\d+\.\d+\.\d+-beta\.[0-9]+(?:\+[0-9A-Za-z.-]+)?$/;
const NIGHTLY_RELEASE_PATTERN = /^v?\d+\.\d+\.\d+-nightly\./;
const SEMVER_PATTERN =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

const REPOSITORIES = {
  production: "Bob-Ddong-Iri-Hoyo/BDIH-Launcher",
  staging: "Bob-Ddong-Iri-Hoyo/BDIH-Launcher-TestProduction",
  nightly: "Bob-Ddong-Iri-Hoyo/BDIH-Launcher-nightly",
};

const COLORS = {
  stable: "2ea44f",
  beta: "d97706",
  staging: "7c3aed",
  nightly: "2563eb",
  total: "444444",
  unavailable: "9f9f9f",
};

function is_record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function is_installer_asset(asset) {
  return is_record(asset)
    && typeof asset.name === "string"
    && INSTALLER_ASSET_PATTERN.test(asset.name);
}

export function installer_download_count(releases) {
  return releases.reduce((releaseTotal, release) => {
    if (!is_record(release) || !Array.isArray(release.assets)) {
      return releaseTotal;
    }

    return releaseTotal + release.assets.reduce((assetTotal, asset) => {
      if (!is_installer_asset(asset)) {
        return assetTotal;
      }

      const downloadCount = Number(asset.download_count);
      return assetTotal + (Number.isSafeInteger(downloadCount) && downloadCount >= 0
        ? downloadCount
        : 0);
    }, 0);
  }, 0);
}

function published_releases(releases) {
  return releases.filter((release) => (
    is_record(release)
    && release.draft !== true
    && typeof release.tag_name === "string"
    && (typeof release.published_at === "string" || typeof release.created_at === "string")
  ));
}

function parse_semver(tagName) {
  const match = SEMVER_PATTERN.exec(tagName);
  if (!match) {
    return undefined;
  }

  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split(".") ?? [],
  };
}

function compare_identifiers(left, right) {
  const leftNumeric = /^(?:0|[1-9]\d*)$/.test(left);
  const rightNumeric = /^(?:0|[1-9]\d*)$/.test(right);

  if (leftNumeric && rightNumeric) {
    return Number(left) - Number(right);
  }
  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }
  return left.localeCompare(right);
}

export function compare_semver(leftTag, rightTag) {
  const left = parse_semver(leftTag);
  const right = parse_semver(rightTag);
  if (!left || !right) {
    throw new Error(`Cannot compare non-SemVer tags: ${leftTag}, ${rightTag}`);
  }

  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] !== right.core[index]) {
      return left.core[index] - right.core[index];
    }
  }

  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) {
      return 0;
    }
    return left.prerelease.length === 0 ? 1 : -1;
  }

  const identifierCount = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < identifierCount; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return leftIdentifier === undefined ? -1 : 1;
    }

    const difference = compare_identifiers(leftIdentifier, rightIdentifier);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function release_time(release) {
  const timestamp = Date.parse(release.published_at ?? release.created_at ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function latest_by_date(releases) {
  return releases.reduce((latestRelease, release) => (
    !latestRelease || release_time(release) > release_time(latestRelease)
      ? release
      : latestRelease
  ), undefined);
}

function latest_by_semver(releases) {
  const semanticReleases = releases.filter((release) => parse_semver(release.tag_name));
  if (semanticReleases.length === 0) {
    return latest_by_date(releases);
  }

  return semanticReleases.reduce((latestRelease, release) => {
    if (!latestRelease) {
      return release;
    }

    const difference = compare_semver(release.tag_name, latestRelease.tag_name);
    if (difference > 0) {
      return release;
    }
    if (difference === 0 && release_time(release) > release_time(latestRelease)) {
      return release;
    }
    return latestRelease;
  }, undefined);
}

export function select_channel_releases({ production, staging, nightly }) {
  const productionReleases = published_releases(production);
  const stagingReleases = published_releases(staging);
  const nightlyReleases = published_releases(nightly);

  return {
    production: productionReleases,
    stable: latest_by_semver(productionReleases.filter((release) => (
      release.prerelease !== true && FINAL_RELEASE_PATTERN.test(release.tag_name)
    ))),
    beta: latest_by_semver(productionReleases.filter((release) => (
      release.prerelease === true && BETA_RELEASE_PATTERN.test(release.tag_name)
    ))),
    staging: latest_by_date(stagingReleases),
    nightly: latest_by_date(nightlyReleases.filter((release) => (
      release.prerelease === true && NIGHTLY_RELEASE_PATTERN.test(release.tag_name)
    ))),
  };
}

function version_badge(label, color, release) {
  return {
    schemaVersion: 1,
    label,
    message: release?.tag_name ?? "not released",
    color: release ? color : COLORS.unavailable,
  };
}

function downloads_badge(color, release) {
  return {
    schemaVersion: 1,
    label: "Downloads",
    message: release ? String(installer_download_count([release])) : "not released",
    color: release ? color : COLORS.unavailable,
  };
}

export function create_badge_documents(releasesByRepository) {
  const selected = select_channel_releases(releasesByRepository);

  return {
    "stable-version.json": version_badge("Stable", COLORS.stable, selected.stable),
    "stable-downloads.json": downloads_badge(COLORS.stable, selected.stable),
    "beta-version.json": version_badge("Beta", COLORS.beta, selected.beta),
    "beta-downloads.json": downloads_badge(COLORS.beta, selected.beta),
    "staging-version.json": version_badge("Staging", COLORS.staging, selected.staging),
    "staging-downloads.json": downloads_badge(COLORS.staging, selected.staging),
    "nightly-version.json": version_badge("Nightly", COLORS.nightly, selected.nightly),
    "nightly-downloads.json": downloads_badge(COLORS.nightly, selected.nightly),
    "production-downloads.json": {
      schemaVersion: 1,
      label: "All Installer Downloads",
      message: String(installer_download_count(selected.production)),
      color: COLORS.total,
    },
  };
}

export async function fetch_releases(repository, options = {}) {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const token = options.token;
  const releases = [];

  for (let page = 1; ; page += 1) {
    const url = `${GITHUB_API_URL}/repos/${repository}/releases?per_page=100&page=${page}`;
    const response = await fetchImplementation(url, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "BDIH-Launcher-readme-release-badges",
        "x-github-api-version": "2022-11-28",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(
        `GitHub releases request failed for ${repository}: ${response.status} ${await response.text()}`,
      );
    }

    const pageReleases = await response.json();
    if (!Array.isArray(pageReleases)) {
      throw new Error(`GitHub releases response for ${repository} was not an array.`);
    }

    releases.push(...pageReleases);
    if (pageReleases.length < 100) {
      return releases;
    }
  }
}

export async function write_badge_documents(outputDirectory, documents) {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(Object.entries(documents).map(([fileName, document]) => (
    writeFile(
      path.join(outputDirectory, fileName),
      `${JSON.stringify(document)}\n`,
      "utf8",
    )
  )));
}

function parse_cli_arguments(args) {
  let outputDirectory;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--output") {
      outputDirectory = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${args[index]}`);
  }

  if (!outputDirectory) {
    throw new Error("Usage: node scripts/generate-readme-release-badges.mjs --output <directory>");
  }

  return { outputDirectory: path.resolve(outputDirectory) };
}

async function main() {
  const { outputDirectory } = parse_cli_arguments(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN?.trim() || undefined;
  const [production, staging, nightly] = await Promise.all([
    fetch_releases(REPOSITORIES.production, { token }),
    fetch_releases(REPOSITORIES.staging, { token }),
    fetch_releases(REPOSITORIES.nightly, { token }),
  ]);
  const documents = create_badge_documents({ production, staging, nightly });
  await write_badge_documents(outputDirectory, documents);

  for (const [fileName, document] of Object.entries(documents)) {
    console.log(`${fileName}: ${document.message}`);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
