const path = require("path");
const baseConfig = require("./electron-builder.config.cjs");

const version = process.env.BDIH_TEST_VERSION || "1.0.0";
const testChannel = process.env.BDIH_TEST_CHANNEL || "stable";
const isNightly = testChannel === "nightly";
const productName = isNightly
  ? "BDIH Launcher Nightly Update Test"
  : "BDIH Launcher Update Test";
const appId = isNightly
  ? "com.fabyday.bdih-launcher.nightly.update-test"
  : "com.fabyday.bdih-launcher.update-test";
const output = process.env.BDIH_TEST_OUTPUT_DIR
  ? path.resolve(process.env.BDIH_TEST_OUTPUT_DIR)
  : path.resolve(__dirname, "tests", "Release", "builds", "stable", version);
const updatePort = process.env.BDIH_UPDATE_TEST_PORT || "45678";

/** @type {import("electron-builder").Configuration} */
module.exports = {
  ...baseConfig,
  appId,
  productName,
  artifactName: isNightly
    ? "BDIH-Launcher-Nightly-Update-Test-${version}-${arch}.${ext}"
    : "BDIH-Launcher-Update-Test-${version}-${arch}.${ext}",
  directories: {
    ...baseConfig.directories,
    output,
  },
  extraMetadata: {
    name: isNightly ? "bdih-launcher-nightly-update-test" : "bdih-launcher-update-test",
    productName,
    version,
  },
  extraResources: [
    ...(baseConfig.extraResources || []),
    {
      from: isNightly ? "build/nightly-update-test-build.json" : "build/update-test-build.json",
      to: isNightly ? "bdih-nightly-update-test.json" : "bdih-update-test.json",
    },
  ],
  detectUpdateChannel: true,
  generateUpdatesFilesForAllChannels: false,
  publish: [
    {
      provider: "generic",
      url: `http://127.0.0.1:${updatePort}/`,
    },
  ],
  mac: {
    ...baseConfig.mac,
    extendInfo: {
      CFBundleDisplayName: productName,
      CFBundleName: productName,
    },
  },
};
