import type { HoyoGameProfileId, HoyoConfigOptionDefinition } from "./HoyoGameProfile";
import type { RuntimeLauncherProfile } from "../../../Common/Types/DataProtoType";

export interface HoyoplayLauncherProfile extends RuntimeLauncherProfile<"hoyoplay", HoyoGameProfileId> {
  kind: "launcher";
  id: "hoyoplay";
  managedGames: HoyoGameProfileId[];
  configurableOptions: HoyoConfigOptionDefinition[];
}

export const HOYOPLAY_LAUNCHER_PROFILE = {
  kind: "launcher",
  id: "hoyoplay",
  displayName: "HoYoPlay",
  executableNames: [
    "launcher.exe",
    "HoYoPlay.exe",
  ],
  executableDiscovery: {
    preferredRelativePaths: [
      "Program Files/HoYoPlay/launcher.exe",
      "Program Files/HoYoPlay/HoYoPlay.exe",
      "Program Files (x86)/HoYoPlay/launcher.exe",
      "Program Files (x86)/HoYoPlay/HoYoPlay.exe",
      "HoYoPlay/launcher.exe",
      "HoYoPlay/HoYoPlay.exe",
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
  managedGames: [
    "zzz",
    "hsr",
    "genshin",
  ],
  allowedLaunchOptionKeys: [
    "enableMsync",
    "hoyoplayInProcessGpu",
    "enableTimeoutFix",
    "leftCommandIsCtrl",
    "retinaMode",
    "metalHud",
    "earlyExitWaitMs",
    "superviseWaitSeconds",
    "allowDuplicateGame",
  ],
  configurableOptions: [
    {
      key: "hoyoplayInProcessGpu",
      label: "HoYoPlay in-process GPU",
      type: "boolean",
      envName: "WINE_HOYOPLAY_ARGS",
      defaultValue: true,
      description: "Runs HoYoPlay with --in-process-gpu unless disabled by launch options.",
    },
    {
      key: "enableMsync",
      label: "Wine msync",
      type: "boolean",
      envName: "WINEMSYNC",
      defaultValue: false,
    },
    {
      key: "superviseWaitSeconds",
      label: "Game supervise wait seconds",
      type: "number",
      envName: "SUPERVISE_STEAM_WAIT_SECONDS",
    },
  ],
} satisfies HoyoplayLauncherProfile;
