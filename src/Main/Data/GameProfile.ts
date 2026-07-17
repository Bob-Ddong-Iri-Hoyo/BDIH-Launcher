import type { InstalledBottleAppPayload } from "../../Common/Types/IPC";
import type {
  RuntimeGameProfile,
  RuntimeLauncherProfile,
  RuntimeLaunchOptionKey,
} from "../../Common/Types/DataProtoType";
import { GENSHIN_HOYO_GAME_PROFILE } from "./Hoyoverse/genshin/profile";
import { HOYOPLAY_LAUNCHER_PROFILE } from "./Hoyoverse/hoyoplay/profile";
import { STARRAIL_HOYO_GAME_PROFILE } from "./Hoyoverse/starrail/profile";
import { ZZZ_HOYO_GAME_PROFILE } from "./Hoyoverse/zenless-zone-zero/profile";
import { STEAM_LAUNCHER_PROFILE } from "./Steam/profile";

export type AppRuntimeProfile = RuntimeGameProfile | RuntimeLauncherProfile;

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

// DXMT is supplied by the selected Wine runtime, so its controls apply to
// every executable rather than only to games with an explicit profile.
const GLOBAL_DXMT_LAUNCH_OPTION_KEYS: readonly RuntimeLaunchOptionKey[] = [
  "dxmtPreferredMaxFrameRate",
  "dxmtMetalFxSpatialUpscale",
  "dxmtMetalFxSpatialUpscaleFactor",
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
  const profileKeys = resolve_app_runtime_profile(app)?.allowedLaunchOptionKeys
    ?? FALLBACK_LAUNCH_OPTION_KEYS;

  return Array.from(new Set([
    ...profileKeys,
    ...GLOBAL_DXMT_LAUNCH_OPTION_KEYS,
  ]));
}

export function get_launcher_runtime_profile(
  launcherId: string,
): RuntimeLauncherProfile | undefined {
  return LAUNCHER_RUNTIME_PROFILES.find((profile) => profile.id === launcherId);
}
