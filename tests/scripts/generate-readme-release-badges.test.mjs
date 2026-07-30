import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  compare_semver,
  create_badge_documents,
  fetch_releases,
  installer_download_count,
  select_channel_releases,
  write_badge_documents,
} from "../../scripts/generate-readme-release-badges.mjs";

function release(tagName, options = {}) {
  return {
    tag_name: tagName,
    draft: false,
    prerelease: tagName.includes("-"),
    published_at: options.publishedAt ?? "2026-07-30T00:00:00Z",
    assets: options.assets ?? [],
    ...options.overrides,
  };
}

test("counts only DMG and ZIP installer assets", () => {
  const downloads = installer_download_count([
    release("v1.0.0-beta.1", {
      assets: [
        { name: "BDIH-Launcher-1.0.0-beta.1-arm64.dmg", download_count: 1 },
        { name: "BDIH-Launcher-1.0.0-beta.1-arm64.dmg.blockmap", download_count: 8 },
        { name: "BDIH-Launcher-1.0.0-beta.1-arm64.zip", download_count: 3 },
        { name: "beta-mac.yml", download_count: 46 },
        { name: "promotion-source.json", download_count: 12 },
      ],
    }),
  ]);

  assert.equal(downloads, 4);
});

test("compares final and prerelease SemVer tags", () => {
  assert.ok(compare_semver("v1.1.0", "v1.0.9") > 0);
  assert.ok(compare_semver("v1.0.0-beta.10", "v1.0.0-beta.2") > 0);
  assert.ok(compare_semver("v1.0.0", "v1.0.0-beta.10") > 0);
});

test("does not expose a Beta prerelease as Stable when no Stable release exists", () => {
  const beta = release("v1.0.0-beta.1");
  const selected = select_channel_releases({
    production: [beta],
    staging: [],
    nightly: [],
  });
  const documents = create_badge_documents({
    production: [beta],
    staging: [],
    nightly: [],
  });

  assert.equal(selected.stable, undefined);
  assert.equal(selected.beta, beta);
  assert.deepEqual(documents["stable-version.json"], {
    schemaVersion: 1,
    label: "Stable",
    message: "not released",
    color: "9f9f9f",
  });
});

test("selects Stable and Beta by SemVer and Staging and Nightly by publish date", () => {
  const selected = select_channel_releases({
    production: [
      release("v1.1.0-beta.2", { publishedAt: "2026-07-27T00:00:00Z" }),
      release("v1.0.0", {
        publishedAt: "2026-07-30T00:00:00Z",
        overrides: { prerelease: false },
      }),
      release("v1.1.0", {
        publishedAt: "2026-07-28T00:00:00Z",
        overrides: { prerelease: false },
      }),
      release("v1.1.0-beta.10", { publishedAt: "2026-07-26T00:00:00Z" }),
    ],
    staging: [
      release("v1.1.0-beta.2.staging.3+staging.beta", {
        publishedAt: "2026-07-28T00:00:00Z",
      }),
      release("v1.1.0-rc.1+staging.stable", {
        publishedAt: "2026-07-30T00:00:00Z",
      }),
    ],
    nightly: [
      release("v1.1.0-nightly.beta.2.20260729.1.gaaaaaaa", {
        publishedAt: "2026-07-29T00:00:00Z",
      }),
      release("v1.1.0-nightly.beta.2.20260730.2.gbbbbbbb", {
        publishedAt: "2026-07-30T00:00:00Z",
      }),
    ],
  });

  assert.equal(selected.stable.tag_name, "v1.1.0");
  assert.equal(selected.beta.tag_name, "v1.1.0-beta.10");
  assert.equal(selected.staging.tag_name, "v1.1.0-rc.1+staging.stable");
  assert.equal(
    selected.nightly.tag_name,
    "v1.1.0-nightly.beta.2.20260730.2.gbbbbbbb",
  );
});

test("paginates GitHub release responses", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => release(`v1.0.${index}`));
  const secondPage = [release("v2.0.0")];
  const requestedUrls = [];
  const fetchImplementation = async (url) => {
    requestedUrls.push(url);
    const body = url.endsWith("page=1") ? firstPage : secondPage;
    return {
      ok: true,
      json: async () => body,
    };
  };

  const releases = await fetch_releases("owner/repository", { fetchImplementation });

  assert.equal(releases.length, 101);
  assert.equal(requestedUrls.length, 2);
  assert.match(requestedUrls[1], /page=2$/);
});

test("writes Shields endpoint documents as newline-terminated JSON", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bdih-readme-badges-"));

  try {
    await write_badge_documents(directory, {
      "stable-version.json": {
        schemaVersion: 1,
        label: "Stable",
        message: "v1.0.0",
        color: "2ea44f",
      },
    });

    assert.equal(
      await readFile(path.join(directory, "stable-version.json"), "utf8"),
      '{"schemaVersion":1,"label":"Stable","message":"v1.0.0","color":"2ea44f"}\n',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
