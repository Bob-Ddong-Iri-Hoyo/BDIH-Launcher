import { PREDEFINED_WINE_VERSIONS } from "../../../Common/Constant/WineCatalog";
import type { DxmtVersion, WineVersion } from "../../../Common/Types/Wine";
import type { Bottle } from "../../Types/Bottle";

export const mockWineVersions: WineVersion[] = PREDEFINED_WINE_VERSIONS.map((version, index) => {
  if (index === 0) {
    return {
      ...version,
      status: "installed",
      progress: 100,
      path: "~/Library/Application Support/BDIH/Wine/wine-9.0-stable",
    };
  }

  if (index === 1) {
    return {
      ...version,
      status: "downloading",
      progress: 46,
    };
  }

  return version;
});

export const mockDxmtVersions: DxmtVersion[] = [
  {
    id: "dxmt-latest",
    name: "DXMT Latest",
    version: "0.7.2",
    status: "installed",
    progress: 100,
    path: "~/Library/Application Support/BDIH/DXMT/dxmt-latest.tar.gz",
  },
  {
    id: "dxmt-preview",
    name: "DXMT Preview",
    version: "0.8.0-preview",
    status: "available",
    progress: 0,
    downloadUrl: "https://example.com/dxmt-preview.tar.gz",
  },
];

export const mockBottles: Bottle[] = [
  {
    id: "hoyoverse",
    name: "HoyoVerse Bottle",
    description: "Shared launcher profile for HoyoVerse titles.",
    wineVersionId: "wine-9.0-stable",
    dxmtVersionId: "dxmt-latest",
    path: "~/Library/Application Support/BDIH/Bottles/hoyoverse",
    prefixPath: "~/Library/Application Support/BDIH/Bottles",
    status: "ready",
    apps: [
      {
        id: "genshin",
        name: "Genshin Impact",
        subtitle: "HoyoPlay launcher",
        wineVersionId: "wine-9.0-stable",
        executablePath: "Z:\\Games\\Genshin Impact\\launcher.exe",
        iconSrc: "https://hoyoplay.hoyoverse.com/favicon.ico",
        source: "launcher",
        lastPlayed: "",
        lastPlayedKey: "main.lastPlayed.today",
        status: "ready",
        processId: "wine-1208",
      },
      {
        id: "starrail",
        name: "Honkai: Star Rail",
        subtitle: "DXMT profile",
        wineVersionId: "wine-9.0-stable",
        executablePath: "Z:\\Games\\Star Rail\\launcher.exe",
        source: "game",
        lastPlayed: "",
        lastPlayedKey: "main.lastPlayed.yesterday",
        status: "ready",
      },
      {
        id: "zenless",
        name: "Zenless Zone Zero",
        subtitle: "Needs prefix setup",
        wineVersionId: "ge-proton-latest",
        source: "launcher",
        lastPlayed: "",
        lastPlayedKey: "main.lastPlayed.never",
        status: "needs-prefix",
      },
    ],
  },
  {
    id: "steam",
    name: "Steam Bottle",
    description: "Steam and library games using a dedicated prefix.",
    wineVersionId: "ge-proton-latest",
    dxmtVersionId: "dxmt-preview",
    path: "~/Library/Application Support/BDIH/Bottles/steam",
    prefixPath: "~/Library/Application Support/BDIH/Bottles",
    status: "updating",
    setupTask: {
      stage: "install",
      progress: 62,
      message: "Installing Steam runtime into the bottle.",
    },
    launcherTasks: {
      steam: {
        stage: "download",
        progress: 38,
        message: "Downloading Steam installer.",
      },
    },
    apps: [
      {
        id: "steam-client",
        name: "Steam",
        subtitle: "Wine 9 prefix",
        wineVersionId: "ge-proton-latest",
        iconSrc: "https://store.steampowered.com/favicon.ico",
        source: "steam",
        lastPlayed: "",
        lastPlayedKey: "main.lastPlayed.threeDaysAgo",
        status: "updating",
      },
    ],
  },
  {
    id: "custom-tools",
    name: "Custom Tools",
    description: "Manual executables and local test recipes.",
    wineVersionId: "wine-8.0-stable",
    path: "~/Library/Application Support/BDIH/Bottles/custom-tools",
    prefixPath: "~/Library/Application Support/BDIH/Bottles",
    status: "needs-setup",
    apps: [],
  },
];

export const mockBottle = mockBottles[0];
