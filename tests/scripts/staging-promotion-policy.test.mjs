import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assert_next_attempt,
  assert_current_candidate,
  create_promotion_provenance,
  resolve_staging_candidate,
  validate_candidate_metadata,
  validate_promotion_provenance,
} from "../../scripts/staging-promotion-policy.mjs";

const SOURCE_COMMIT = "0123456789abcdef0123456789abcdef01234567";

function stable_candidate(overrides = {}) {
  return {
    schemaVersion: 1,
    version: "1.0.0-rc.2",
    targetVersion: "1.0.0",
    attempt: 2,
    tag: "v1.0.0-rc.2+staging.stable",
    channel: "stable",
    sourceRepository: "Bob-Ddong-Iri-Hoyo/BDIH-Launcher",
    sourceCommit: SOURCE_COMMIT,
    sourceRunId: "12345",
    sourceRunUrl: "https://github.com/Bob-Ddong-Iri-Hoyo/BDIH-Launcher/actions/runs/12345",
    createdAt: "2026-07-22T12:00:00.000Z",
    ...overrides,
  };
}

test("resolves Stable RC and Beta staging versions from target plus attempt", () => {
  assert.deepEqual(resolve_staging_candidate("1.0.0", 2), {
    targetVersion: "1.0.0",
    attempt: 2,
    channel: "stable",
    channelLabel: "Stable",
    version: "1.0.0-rc.2",
    tag: "v1.0.0-rc.2+staging.stable",
  });
  assert.deepEqual(resolve_staging_candidate("1.0.0-beta.2", 3), {
    targetVersion: "1.0.0-beta.2",
    attempt: 3,
    channel: "beta",
    channelLabel: "Beta",
    version: "1.0.0-beta.2.staging.3",
    tag: "v1.0.0-beta.2.staging.3+staging.beta",
  });
});

test("requires attempts to advance monotonically for the same target", () => {
  const releases = [
    { tagName: "v1.0.0-rc.1+staging.stable", isDraft: false },
    { tagName: "v1.0.0-rc.2+staging.stable", isDraft: false },
    { tagName: "v1.0.0-beta.1.staging.1+staging.beta", isDraft: false },
  ];

  assert.equal(assert_next_attempt(releases, "1.0.0", 3).expectedAttempt, 3);
  assert.throws(
    () => assert_next_attempt(releases, "1.0.0", 2),
    /Use attempt 3/,
  );
});

test("selects only the latest published candidate for each Stable or Beta target", () => {
  const releases = [
    { tagName: "v1.0.0-rc.1+staging.stable", isDraft: false, isPrerelease: false },
    { tagName: "v1.0.0-rc.2+staging.stable", isDraft: false, isPrerelease: false },
    { tagName: "v1.0.0-beta.1.staging.1+staging.beta", isDraft: false, isPrerelease: true },
    { tagName: "v1.0.0-beta.1.staging.2+staging.beta", isDraft: false, isPrerelease: true },
  ];

  assert.equal(
    assert_current_candidate(releases, "1.0.0", "v1.0.0-rc.2+staging.stable").attempt,
    2,
  );
  assert.equal(
    assert_current_candidate(
      releases,
      "1.0.0-beta.1",
      "v1.0.0-beta.1.staging.2+staging.beta",
    ).attempt,
    2,
  );
  assert.throws(
    () => assert_current_candidate(releases, "1.0.0-beta.1", "v1.0.0-beta.1.staging.1+staging.beta"),
    /superseded/,
  );
});

test("rejects candidate metadata whose tag does not match its target", () => {
  assert.throws(
    () => validate_candidate_metadata(stable_candidate({ tag: "v1.0.0-rc.1+staging.stable" })),
    /Candidate tag must be/,
  );
});

test("pins a Production draft to candidate metadata and asset checksums", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bdih-promotion-"));

  try {
    await Promise.all([
      writeFile(path.join(directory, "BDIH-Launcher-1.0.0-arm64.dmg"), "dmg"),
      writeFile(path.join(directory, "BDIH-Launcher-1.0.0-arm64.zip"), "zip"),
      writeFile(path.join(directory, "latest-mac.yml"), "version: 1.0.0\n"),
      writeFile(path.join(directory, "BDIH-Launcher-1.0.0-arm64.zip.blockmap"), "blockmap"),
    ]);
    const candidate = stable_candidate();
    const provenance = await create_promotion_provenance({
      candidate,
      productionTag: "v1.0.0",
      assetDirectory: directory,
      createdAt: "2026-07-22T13:00:00.000Z",
    });

    await validate_promotion_provenance({
      provenance,
      candidate,
      assetDirectory: directory,
      productionTag: "v1.0.0",
    });

    await writeFile(path.join(directory, "BDIH-Launcher-1.0.0-arm64.zip"), "tampered");
    await assert.rejects(
      validate_promotion_provenance({
        provenance,
        candidate,
        assetDirectory: directory,
        productionTag: "v1.0.0",
      }),
      /checksums do not match/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("pins a Production Beta draft to beta update metadata", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bdih-beta-promotion-"));

  try {
    await Promise.all([
      writeFile(path.join(directory, "BDIH-Launcher-1.0.0-beta.1-arm64.dmg"), "dmg"),
      writeFile(path.join(directory, "BDIH-Launcher-1.0.0-beta.1-arm64.zip"), "zip"),
      writeFile(path.join(directory, "beta-mac.yml"), "version: 1.0.0-beta.1\n"),
      writeFile(path.join(directory, "latest-mac.yml"), "version: ignored\n"),
      writeFile(path.join(directory, "BDIH-Launcher-1.0.0-beta.1-arm64.zip.blockmap"), "blockmap"),
    ]);
    const candidate = stable_candidate({
      version: "1.0.0-beta.1.staging.2",
      targetVersion: "1.0.0-beta.1",
      tag: "v1.0.0-beta.1.staging.2+staging.beta",
      channel: "beta",
    });
    const provenance = await create_promotion_provenance({
      candidate,
      productionTag: "v1.0.0-beta.1",
      assetDirectory: directory,
    });
    assert.equal(provenance.assets.some((asset) => asset.name === "latest-mac.yml"), false);

    await validate_promotion_provenance({
      provenance,
      candidate,
      assetDirectory: directory,
      productionTag: "v1.0.0-beta.1",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
