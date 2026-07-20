import assert from "node:assert/strict";
import test from "node:test";
import {
  expand_version_expression,
  resolve_build_plan,
  validate_version,
} from "../../scripts/build-update-test.mjs";

test("expands an ascending Stable patch range", () => {
  assert.deepEqual(expand_version_expression("1.0.0~1.0.3"), [
    "1.0.0",
    "1.0.1",
    "1.0.2",
    "1.0.3",
  ]);
});

test("expands a descending prerelease range", () => {
  assert.deepEqual(expand_version_expression("1.1.0-beta.3..1.1.0-beta.1"), [
    "1.1.0-beta.3",
    "1.1.0-beta.2",
    "1.1.0-beta.1",
  ]);
});

test("resolves Stable and Beta ranges into one ordered build plan", () => {
  assert.deepEqual(resolve_build_plan([
    "--stable",
    "1.0.0~1.0.1",
    "--beta",
    "1.1.0-beta.1~1.1.0-beta.2",
    "--dry-run",
  ], {}).builds, [
    { channel: "stable", version: "1.0.0" },
    { channel: "stable", version: "1.0.1" },
    { channel: "beta", version: "1.1.0-beta.1" },
    { channel: "beta", version: "1.1.0-beta.2" },
  ]);
});

test("rejects a Beta build without a beta prerelease identifier", () => {
  assert.throws(
    () => validate_version("1.1.0", "beta"),
    /must use a beta prerelease version/,
  );
});

test("rejects a range that changes more than one numeric component", () => {
  assert.throws(
    () => expand_version_expression("1.0.0~1.1.9"),
    /change exactly one numeric component/,
  );
});

test("requires both range endpoint arguments", () => {
  assert.throws(
    () => resolve_build_plan(["--channel", "stable", "--from", "1.0.0"], {}),
    /Both --from and --to are required/,
  );
});

test("accepts the pnpm argument delimiter and lets a CLI range override the environment", () => {
  const plan = resolve_build_plan([
    "--channel",
    "stable",
    "--",
    "--range",
    "1.0.0~1.0.1",
    "--dry-run",
    "--publish-only",
  ], { BDIH_TEST_VERSION: "9.9.9" });

  assert.deepEqual(
    plan.builds,
    [
      { channel: "stable", version: "1.0.0" },
      { channel: "stable", version: "1.0.1" },
    ],
  );
  assert.equal(plan.dryRun, true);
  assert.equal(plan.publishOnly, true);
});
