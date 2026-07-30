import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assert_next_attempt,
  assert_current_candidate,
  create_promotion_provenance,
  prepare_production_package_version,
  resolve_next_staging_candidate,
  resolve_production_target,
  resolve_staging_candidate,
  validate_candidate_metadata,
  validate_candidate_lineage,
  validate_source_train_version,
  validate_promotion_provenance,
} from "../../scripts/staging-promotion-policy.mjs";

const SOURCE_COMMIT = "0123456789abcdef0123456789abcdef01234567";

function beta_candidate(overrides = {}) {
  return {
    schemaVersion: 1,
    version: "1.0.0-beta.1.staging.2",
    targetVersion: "1.0.0-beta.1",
    attempt: 2,
    tag: "v1.0.0-beta.1.staging.2+staging.beta",
    channel: "beta",
    sourceRepository: "Bob-Ddong-Iri-Hoyo/BDIH-Launcher",
    sourceCommit: SOURCE_COMMIT,
    sourceRunId: "12345",
    sourceRunUrl: "https://github.com/Bob-Ddong-Iri-Hoyo/BDIH-Launcher/actions/runs/12345",
    createdAt: "2026-07-22T12:00:00.000Z",
    promotedFrom: null,
    ...overrides,
  };
}

function stable_candidate(overrides = {}) {
  return {
    schemaVersion: 1,
    version: "1.0.0-rc.2",
    targetVersion: "1.0.0",
    attempt: 2,
    tag: "v1.0.0-rc.2+staging.stable",
    channel: "stable",
    sourceRepository: "Bob-Ddong-Iri-Hoyo/BDIH-Launcher",
    sourceCommit: "1123456789abcdef0123456789abcdef01234567",
    sourceRunId: "12346",
    sourceRunUrl: "https://github.com/Bob-Ddong-Iri-Hoyo/BDIH-Launcher/actions/runs/12346",
    createdAt: "2026-07-22T13:00:00.000Z",
    promotedFrom: beta_candidate(),
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

test("resolves the next immutable candidate number from existing releases and tags", () => {
  const candidates = [
    { tagName: "v1.0.0-rc.1+staging.stable", isDraft: false },
    { tagName: "v1.0.0-rc.2+staging.stable", isDraft: true },
    { tagName: "v1.0.0-beta.1.staging.5+staging.beta", isDraft: false },
    { tagName: "v1.0.0-beta.1.staging.6+staging.beta" },
  ];

  assert.deepEqual(resolve_next_staging_candidate(candidates, "1.0.0"), {
    targetVersion: "1.0.0",
    attempt: 3,
    channel: "stable",
    channelLabel: "Stable",
    version: "1.0.0-rc.3",
    tag: "v1.0.0-rc.3+staging.stable",
    expectedAttempt: 3,
  });
  assert.equal(
    resolve_next_staging_candidate(candidates, "1.0.0-beta.1").version,
    "1.0.0-beta.1.staging.7",
  );
});

test("derives the Production target from package.json, channel, and Beta number", () => {
  assert.deepEqual(resolve_production_target("1.0.0", "beta", 2), {
    releaseTrain: "1.0.0",
    channel: "beta",
    betaNumber: 2,
    targetVersion: "1.0.0-beta.2",
  });
  assert.deepEqual(resolve_production_target("1.0.0", "stable", 0), {
    releaseTrain: "1.0.0",
    channel: "stable",
    betaNumber: null,
    targetVersion: "1.0.0",
  });
  assert.throws(
    () => resolve_production_target("1.0.0", "beta", 0),
    /positive integer/,
  );
  assert.throws(
    () => resolve_production_target("1.0.0", "stable", 2),
    /only valid for the Beta channel/,
  );
  assert.throws(
    () => resolve_production_target("1.0.0-beta.1", "beta", 2),
    /final release train/,
  );
});

test("keeps package.json on the release train while allowing Beta and Stable targets", () => {
  assert.deepEqual(validate_source_train_version("1.0.0", "1.0.0-beta.3"), {
    sourceVersion: "1.0.0",
    targetVersion: "1.0.0-beta.3",
    targetChannel: "beta",
    releaseTrain: "1.0.0",
  });
  assert.equal(validate_source_train_version("1.0.0", "1.0.0").targetChannel, "stable");
  assert.throws(
    () => validate_source_train_version("1.0.0", "1.1.0-beta.1"),
    /release train 1\.1\.0/,
  );
  assert.throws(
    () => validate_source_train_version("1.0.0-beta.1", "1.0.0-beta.1"),
    /must stay at release train 1\.0\.0/,
  );
});

test("injects a channel target only into the temporary Production package", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bdih-production-version-"));
  const packagePath = path.join(directory, "package.json");

  try {
    await writeFile(packagePath, `${JSON.stringify({ name: "bdih", version: "1.0.0" }, null, 2)}\n`);
    const prepared = await prepare_production_package_version(packagePath, "1.0.0-beta.2");
    assert.equal(prepared.packagedVersion, "1.0.0-beta.2");
    assert.equal(JSON.parse(await readFile(packagePath, "utf8")).version, "1.0.0-beta.2");

    await writeFile(packagePath, `${JSON.stringify({ name: "bdih", version: "1.0.0" }, null, 2)}\n`);
    await assert.rejects(
      prepare_production_package_version(packagePath, "1.1.0-beta.1"),
      /release train 1\.1\.0/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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

test("requires every Stable RC to identify a Beta candidate from the same version line", () => {
  assert.throws(
    () => validate_candidate_metadata(stable_candidate({ promotedFrom: null })),
    /must record the Beta candidate/,
  );
  assert.throws(
    () => validate_candidate_metadata(stable_candidate({
      promotedFrom: beta_candidate({
        version: "1.1.0-beta.1.staging.2",
        targetVersion: "1.1.0-beta.1",
        tag: "v1.1.0-beta.1.staging.2+staging.beta",
      }),
    })),
    /does not belong to Stable/,
  );
});

test("pins Stable lineage to the exact Beta release metadata", () => {
  const stable = stable_candidate();
  assert.equal(
    validate_candidate_lineage(stable, beta_candidate()).promotedFrom.sourceCommit,
    SOURCE_COMMIT,
  );
  assert.throws(
    () => validate_candidate_lineage(stable, beta_candidate({ sourceRunId: "99999" })),
    /does not match/,
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
    const candidate = beta_candidate();
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
