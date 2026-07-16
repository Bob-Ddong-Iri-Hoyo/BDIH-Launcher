const repository = process.env.PUBLISH_REPOSITORY || process.env.GITHUB_REPOSITORY || "";
const [owner, repo] = repository.split("/");

const channel = process.env.UPDATE_CHANNEL || "latest";
const releaseType = process.env.RELEASE_TYPE || "release";
const releaseChannel = process.env.BDIH_RELEASE_CHANNEL || channel;
const isNightly = releaseChannel === "nightly";
const productName = isNightly ? "BDIH-Launcher Nightly" : "BDIH-Launcher";
const appId = isNightly ? "com.fabyday.bdih-launcher.nightly" : "com.fabyday.bdih-launcher";

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId,
  productName,
  ...(isNightly ? {
    artifactName: "BDIH-Launcher-Nightly-${version}-${arch}.${ext}",
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
    ...(isNightly ? [
      {
        from: "build/nightly-build.json",
        to: "bdih-nightly-build.json",
      },
    ] : []),
  ],
  detectUpdateChannel: true,
  generateUpdatesFilesForAllChannels: true,
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
