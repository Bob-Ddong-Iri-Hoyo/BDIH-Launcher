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
  launchMode: "steam-client",
  configurableOptions: [
    {
      key: "steamWebHelperInProcessGpu",
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
      defaultValue: true,
    },
    {
      key: "steamAppId",
      label: "Steam app id",
      type: "string",
      envName: "SteamAppId",
    },
  ],
} satisfies SteamLauncherProfile;
