import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDirectory, "../..");
const scriptPath = join(projectRoot, "scripts/createP12.sh");

function runScript(args, environment, expectedStatus = 0) {
  const result = spawnSync(scriptPath, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...environment,
    },
  });

  assert.equal(
    result.status,
    expectedStatus,
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
  );

  return result;
}

function certificateSha1(path) {
  return new X509Certificate(readFileSync(path)).fingerprint.replaceAll(":", "");
}

test("electron-builder selects channel-specific active bridge requirements", () => {
  const workDirectory = mkdtempSync(join(tmpdir(), "bdih-signing-config-test-"));
  const bridgeDirectory = join(workDirectory, "build/signing/bridge");
  const renewalDirectory = join(bridgeDirectory, "renewal-test");
  const configPath = join(workDirectory, "electron-builder.config.cjs");
  const stableRequirements = "build/signing/bridge/renewal-test/stable.requirements";
  const nightlyRequirements = "build/signing/bridge/renewal-test/nightly.requirements";

  try {
    mkdirSync(renewalDirectory, { recursive: true });
    copyFileSync(join(projectRoot, "electron-builder.config.cjs"), configPath);
    writeFileSync(join(renewalDirectory, "stable.requirements"), "identifier stable\n");
    writeFileSync(join(renewalDirectory, "nightly.requirements"), "identifier nightly\n");
    writeFileSync(join(bridgeDirectory, "active.json"), `${JSON.stringify({
      stableRequirements,
      nightlyRequirements,
    })}\n`);

    const readRequirements = (channel) => {
      const result = spawnSync(process.execPath, [
        "-e",
        "const config = require(process.argv[1]); process.stdout.write(config.mac.requirements ?? '');",
        configPath,
      ], {
        encoding: "utf8",
        env: {
          ...process.env,
          BDIH_RELEASE_CHANNEL: channel,
          BDIH_REQUIRE_CODE_SIGNING: "true",
        },
      });

      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };

    assert.equal(readRequirements("latest"), stableRequirements);
    assert.equal(readRequirements("nightly"), nightlyRequirements);
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
});

test("prepares and activates a guarded macOS signing renewal", {
  skip: process.platform !== "darwin" ? "macOS code requirement tools are required" : false,
}, () => {
  const workDirectory = mkdtempSync(join(tmpdir(), "bdih-signing-renewal-test-"));
  const privateDirectory = join(workDirectory, "private");
  const bridgeDirectory = join(workDirectory, "bridge");
  const currentPassword = "temporary-current-signing-password";
  const replacementPassword = "temporary-replacement-signing-password";

  try {
    runScript(
      ["--output-dir", privateDirectory],
      { BDIH_SIGNING_PASSWORD: currentPassword },
    );

    const activeCertificate = join(privateDirectory, "bdih-code-signing.crt");
    const oldSha1 = certificateSha1(activeCertificate);
    const preparation = runScript(
      [
        "--output-dir",
        privateDirectory,
        "--bridge-output-dir",
        bridgeDirectory,
        "--prepare-renewal",
      ],
      {
        BDIH_SIGNING_PASSWORD: currentPassword,
        BDIH_RENEWAL_PASSWORD: replacementPassword,
      },
    );
    const renewalId = preparation.stdout.match(/Renewal id:\s+(renewal-[^\s]+)/)?.[1];

    assert.ok(renewalId, preparation.stdout);
    assert.ok(existsSync(join(bridgeDirectory, "active.json")));
    assert.ok(existsSync(join(bridgeDirectory, renewalId, "stable.requirements")));
    assert.ok(existsSync(join(bridgeDirectory, renewalId, "nightly.requirements")));
    assert.ok(existsSync(join(privateDirectory, "renewal", renewalId, "bdih-code-signing.p12")));

    const manifest = JSON.parse(readFileSync(join(bridgeDirectory, "active.json"), "utf8"));
    assert.equal(manifest.renewalId, renewalId);
    assert.equal(manifest.oldCertificate.sha1, oldSha1);
    assert.notEqual(manifest.newCertificate.sha1, oldSha1);

    const refused = spawnSync(scriptPath, [
      "--output-dir",
      privateDirectory,
      "--bridge-output-dir",
      bridgeDirectory,
      "--activate-renewal",
      renewalId,
    ], {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        BDIH_RENEWAL_PASSWORD: replacementPassword,
      },
    });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /--confirm-bridge-release/);

    runScript(
      [
        "--output-dir",
        privateDirectory,
        "--bridge-output-dir",
        bridgeDirectory,
        "--activate-renewal",
        renewalId,
        "--confirm-bridge-release",
      ],
      { BDIH_RENEWAL_PASSWORD: replacementPassword },
    );

    assert.equal(certificateSha1(activeCertificate), manifest.newCertificate.sha1);
    assert.equal(existsSync(join(bridgeDirectory, "active.json")), false);
    assert.ok(existsSync(join(bridgeDirectory, `completed-${renewalId}.json`)));
    assert.ok(existsSync(join(
      privateDirectory,
      "archive",
      `${renewalId}-old-${oldSha1.slice(0, 12)}`,
      "bdih-code-signing.p12",
    )));
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
});
