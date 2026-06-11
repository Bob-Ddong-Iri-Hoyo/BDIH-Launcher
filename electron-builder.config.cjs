const repository = process.env.GITHUB_REPOSITORY ?? "";
const [owner, repo] = repository.split("/");

const channel = process.env.UPDATE_CHANNEL || "latest";
const releaseType = process.env.RELEASE_TYPE || "release";

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "com.fabyday.bdih-launcher",
  productName: "BDIH Launcher",
  directories: {
    output: "release",
  },
  files: ["dist/**/*", "package.json"],
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
    target: ["dmg", "zip"],
    category: "public.app-category.games",
  },
  win: {
    target: ["nsis"],
  },
  linux: {
    target: ["AppImage"],
    category: "Game",
  },
};
