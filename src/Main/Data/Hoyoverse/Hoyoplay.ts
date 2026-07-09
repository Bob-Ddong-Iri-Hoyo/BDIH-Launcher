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
  managedGames: [
    "zzz",
    "hsr",
    "genshin",
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
      defaultValue: true,
    },
    {
      key: "superviseWaitSeconds",
      label: "Game supervise wait seconds",
      type: "number",
      envName: "SUPERVISE_STEAM_WAIT_SECONDS",
    },
  ],
} satisfies HoyoplayLauncherProfile;
