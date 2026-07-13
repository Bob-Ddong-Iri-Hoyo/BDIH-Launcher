import type { InstalledBottleAppPayload } from "../../Common/Types/IPC";
import type {
  RuntimeGameProfile,
  RuntimeLauncherProfile,
  RuntimeLaunchOptionKey,
} from "../../Common/Types/DataProtoType";
import { GENSHIN_HOYO_GAME_PROFILE } from "./Hoyoverse/Genshin";
import { HOYOPLAY_LAUNCHER_PROFILE } from "./Hoyoverse/Hoyoplay";
import { STARRAIL_HOYO_GAME_PROFILE } from "./Hoyoverse/Starrail";
import { ZZZ_HOYO_GAME_PROFILE } from "./Hoyoverse/ZenlessZoneZero";
import { STEAM_LAUNCHER_PROFILE } from "./Steam/Steam";

export type AppRuntimeProfile = RuntimeGameProfile | RuntimeLauncherProfile;

export const APP_RUNTIME_PROFILES = [
  GENSHIN_HOYO_GAME_PROFILE,
  STARRAIL_HOYO_GAME_PROFILE,
  ZZZ_HOYO_GAME_PROFILE,
  HOYOPLAY_LAUNCHER_PROFILE,
  STEAM_LAUNCHER_PROFILE,
] as const satisfies readonly AppRuntimeProfile[];

const LAUNCHER_RUNTIME_PROFILES = [
  HOYOPLAY_LAUNCHER_PROFILE,
  STEAM_LAUNCHER_PROFILE,
] as const satisfies readonly RuntimeLauncherProfile[];

const FALLBACK_LAUNCH_OPTION_KEYS: readonly RuntimeLaunchOptionKey[] = [
  "enableMsync",
  "leftCommandIsCtrl",
  "retinaMode",
  "metalHud",
  "dxmtPreferredMaxFrameRate",
  "dxmtMetalFxSpatialUpscale",
  "dxmtMetalFxSpatialUpscaleFactor",
  "earlyExitWaitMs",
];

type RuntimeProfileAppIdentity = Pick<
  InstalledBottleAppPayload,
  "id" | "name" | "source" | "executablePath" | "steamAppId"
>;

export function resolve_app_runtime_profile(
  app?: RuntimeProfileAppIdentity,
): AppRuntimeProfile | undefined {
  if (!app) {
    return undefined;
  }

  const executableName = app.executablePath
    ?.replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop()
    ?.toLowerCase();
  const identity = [app.id, app.name, app.executablePath]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  const gameProfile = [
    GENSHIN_HOYO_GAME_PROFILE,
    STARRAIL_HOYO_GAME_PROFILE,
    ZZZ_HOYO_GAME_PROFILE,
  ].find((profile) =>
    app.id === profile.appId
    || identity.includes(profile.appId)
    || profile.executableNames.some((name) => name.toLowerCase() === executableName),
  );

  if (gameProfile) {
    return gameProfile;
  }

  if (
    executableName === "steam.exe"
    || app.id.toLowerCase() === "steam"
    || app.source === "steam"
    || Boolean(app.steamAppId)
  ) {
    return STEAM_LAUNCHER_PROFILE;
  }

  if (
    app.id.toLowerCase() === "hoyoplay"
    || identity.includes("hoyoplay")
    || HOYOPLAY_LAUNCHER_PROFILE.executableNames.some((name) => name.toLowerCase() === executableName)
  ) {
    return HOYOPLAY_LAUNCHER_PROFILE;
  }

  return undefined;
}

export function launch_option_keys_for_app(
  app?: RuntimeProfileAppIdentity,
): readonly RuntimeLaunchOptionKey[] {
  return resolve_app_runtime_profile(app)?.allowedLaunchOptionKeys
    ?? FALLBACK_LAUNCH_OPTION_KEYS;
}

export function get_launcher_runtime_profile(
  launcherId: string,
): RuntimeLauncherProfile | undefined {
  return LAUNCHER_RUNTIME_PROFILES.find((profile) => profile.id === launcherId);
}
