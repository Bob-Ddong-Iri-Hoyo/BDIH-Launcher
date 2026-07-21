const fs = require("fs");
const path = require("path");
const baseConfig = require("./electron-builder.config.cjs");

const version = process.env.BDIH_STAGING_VERSION || require("./package.json").version;
const stagingChannel = process.env.BDIH_STAGING_CHANNEL || "beta";
const repository = process.env.PUBLISH_REPOSITORY || "Bob-Ddong-Iri-Hoyo/BDIH-Launcher-TestProduction";
const [owner, repo] = repository.split("/");
const productName = "BDIH Launcher Staging";
const appId = "day.faby.bdih-launcher.staging";
const channelLabel = stagingChannel === "stable" ? "Stable" : "Beta";
const output = process.env.BDIH_STAGING_OUTPUT_DIR
  ? path.resolve(process.env.BDIH_STAGING_OUTPUT_DIR)
  : path.resolve(__dirname, "release");
const markerPath = path.resolve(__dirname, "node_modules", ".cache", "bdih-launcher", "staging-build.json");

if (stagingChannel !== "stable" && stagingChannel !== "beta") {
  throw new Error(`Staging only supports stable and beta channels. Got: ${stagingChannel}`);
}

if (!owner || !repo) {
  throw new Error(`PUBLISH_REPOSITORY must use the owner/repository form. Got: ${repository}`);
}

fs.mkdirSync(path.dirname(markerPath), { recursive: true });
fs.writeFileSync(markerPath, `${JSON.stringify({
  channel: stagingChannel,
  sourceCommit: process.env.BDIH_STAGING_SOURCE_COMMIT || "local",
}, null, 2)}\n`);

// A production certificate bridge contains requirements for the production
// and Nightly bundle identifiers. Staging intentionally uses its own bundle
// identifier, so it relies on the signing identity's normal designated
// requirement instead of inheriting a production bridge requirement.
const { requirements: _productionRequirements, ...baseMacConfig } = baseConfig.mac || {};

/** @type {import("electron-builder").Configuration} */
module.exports = {
  ...baseConfig,
  appId,
  productName,
  artifactName: `BDIH-Launcher-Staging-${channelLabel}-\${version}.\${ext}`,
  directories: {
    ...baseConfig.directories,
    output,
  },
  extraMetadata: {
    name: "bdih-launcher-staging",
    productName,
    version,
  },
  extraResources: [
    ...(baseConfig.extraResources || []).filter((resource) =>
      resource?.to !== "bdih-nightly-build.json"),
    {
      from: markerPath,
      to: "bdih-staging-build.json",
    },
  ],
  detectUpdateChannel: true,
  generateUpdatesFilesForAllChannels: true,
  publish: [
    {
      provider: "github",
      owner,
      repo,
      channel: stagingChannel === "stable" ? "latest" : "beta",
      releaseType: stagingChannel === "stable" ? "release" : "prerelease",
    },
  ],
  mac: {
    ...baseMacConfig,
    extendInfo: {
      CFBundleDisplayName: productName,
      CFBundleName: productName,
    },
  },
};
