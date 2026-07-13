import type {
  RuntimeConfigOptionDefinition,
  RuntimeConfigValueType,
  RuntimeLauncherProfile,
} from "../../../Common/Types/DataProtoType";

export type SteamLaunchMode = "wine-direct" | "steam-client";

export type SteamConfigValueType = Extract<RuntimeConfigValueType, "boolean" | "number" | "string">;

export interface SteamConfigOptionDefinition extends RuntimeConfigOptionDefinition {
  type: SteamConfigValueType;
}

export interface SteamLauncherProfile extends RuntimeLauncherProfile<"steam"> {
  id: "steam";
  launchMode: SteamLaunchMode;
  configurableOptions: SteamConfigOptionDefinition[];
}

export const STEAM_LAUNCHER_PROFILE = {
  kind: "launcher",
  id: "steam",
  displayName: "Steam",
  executableNames: [
    "steam.exe",
    "Steam.exe",
  ],
  executableDiscovery: {
    preferredRelativePaths: [
      "Program Files (x86)/Steam/steam.exe",
      "Program Files/Steam/steam.exe",
      "Steam/steam.exe",
      "steam.exe",
    ],
    fallbackDrives: ["c"],
    maxDepth: 5,
    maxEntries: 5000,
    skipDirectoryNames: [
      "windows",
      "$recycle.bin",
      "temp",
      "tmp",
      "cache",
    ],
  },
  launchMode: "steam-client",
  allowedLaunchOptionKeys: [
    "enableMsync",
    "steamWebHelperArgs",
    "leftCommandIsCtrl",
    "retinaMode",
    "metalHud",
    "earlyExitWaitMs",
    "superviseWaitSeconds",
  ],
  configurableOptions: [
    {
      key: "steamWebHelperArgs",
      label: "Steam web helper in-process GPU",
      type: "boolean",
      envName: "STEAM_WEBHELPER_ARGS",
      defaultValue: true,
      description: "Controls the Steam web helper GPU workaround exposed in launch options.",
    },
    {
      key: "enableMsync",
      label: "Wine msync",
      type: "boolean",
      envName: "WINEMSYNC",
      defaultValue: false,
    },
    {
      key: "steamAppId",
      label: "Steam app id",
      type: "string",
      envName: "SteamAppId",
    },
  ],
} satisfies SteamLauncherProfile;
