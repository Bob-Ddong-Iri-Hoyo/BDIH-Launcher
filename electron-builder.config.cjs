const repository = process.env.PUBLISH_REPOSITORY || process.env.GITHUB_REPOSITORY || "";
const [owner, repo] = repository.split("/");

const channel = process.env.UPDATE_CHANNEL || "latest";
const releaseType = process.env.RELEASE_TYPE || "release";

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "com.fabyday.bdih-launcher",
  productName: "BDIH-Launcher",
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
