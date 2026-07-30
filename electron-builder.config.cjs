const fs = require("fs");
const path = require("path");

const repository = process.env.PUBLISH_REPOSITORY || process.env.GITHUB_REPOSITORY || "";
const [owner, repo] = repository.split("/");

const channel = process.env.UPDATE_CHANNEL || "latest";
const releaseType = process.env.RELEASE_TYPE || "release";
const releaseChannel = process.env.BDIH_RELEASE_CHANNEL || channel;
const isNightly = releaseChannel === "nightly";
const requireCodeSigning = process.env.BDIH_REQUIRE_CODE_SIGNING === "true";
const productName = isNightly ? "BDIH Launcher Nightly" : "BDIH Launcher";
const artifactName = isNightly
  ? "BDIH-Launcher-Nightly-${version}-${arch}.${ext}"
  : "BDIH-Launcher-${version}-${arch}.${ext}";
const appId = isNightly ? "day.faby.bdih-launcher.nightly" : "day.faby.bdih-launcher";

function resolveBridgeRequirements() {
  const bridgeRoot = path.resolve(__dirname, "build/signing/bridge");
  const activeManifestPath = path.join(bridgeRoot, "active.json");

  if (!fs.existsSync(activeManifestPath)) {
    return undefined;
  }

  const manifest = JSON.parse(fs.readFileSync(activeManifestPath, "utf8"));
  const configuredPath = isNightly
    ? manifest.nightlyRequirements
    : manifest.stableRequirements;

  if (typeof configuredPath !== "string" || configuredPath.length === 0) {
    throw new Error(`Active signing bridge does not define ${isNightly ? "nightly" : "stable"} requirements.`);
  }

  const resolvedPath = path.resolve(__dirname, configuredPath);
  const bridgePrefix = `${bridgeRoot}${path.sep}`;

  if (!resolvedPath.startsWith(bridgePrefix)) {
    throw new Error(`Signing bridge requirements must remain inside ${bridgeRoot}.`);
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Signing bridge requirements do not exist: ${resolvedPath}`);
  }

  return path.relative(__dirname, resolvedPath);
}

const bridgeRequirements = requireCodeSigning
  ? resolveBridgeRequirements()
  : undefined;

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId,
  productName,
  artifactName,
  ...(isNightly ? {
    extraMetadata: {
      name: "bdih-launcher-nightly",
      productName,
    },
  } : {}),
  directories: {
    output: "release",
  },
  files: ["dist/**/*", "package.json"],
  extraResources: [
    {
      from: "build/icon.png",
      to: "icon.png",
    },
    {
      from: "build/ko.lproj",
      to: "ko.lproj",
    },
    {
      from: "resouces/locales",
      to: "locales",
    },
    {
      from: "build/native/bdih-guardian",
      to: "native/bdih-guardian",
    },
    ...(isNightly ? [
      {
        from: "build/nightly-build.json",
        to: "bdih-nightly-build.json",
      },
    ] : []),
  ],
  detectUpdateChannel: true,
  generateUpdatesFilesForAllChannels: true,
  forceCodeSigning: requireCodeSigning,
  publish: [
    {
      provider: "github",
      ...(owner && repo ? { owner, repo } : {}),
      channel,
      releaseType,
    },
  ],
  mac: {
    icon: "build/icon.icns",
    binaries: ["Contents/Resources/native/bdih-guardian"],
    ...(bridgeRequirements ? { requirements: bridgeRequirements } : {}),
    ...(isNightly ? {
      extendInfo: {
        CFBundleDisplayName: productName,
        CFBundleName: productName,
      },
    } : {}),
    target: [
      {
        target: "dmg",
        arch: ["arm64"],
      },
      {
        target: "zip",
        arch: ["arm64"],
      },
    ],
    category: "public.app-category.games",
  },
};
