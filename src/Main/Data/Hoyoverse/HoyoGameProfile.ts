import { GENSHIN_HOYO_GAME_PROFILE } from "./Genshin";
import { STARRAIL_HOYO_GAME_PROFILE } from "./Starrail";
import { ZZZ_HOYO_GAME_PROFILE } from "./ZenlessZoneZero";
import type { BottleLaunchOptionsPayload } from "../../../Common/Types/IPC";
import type {
  RuntimeConfigOptionDefinition,
  RuntimeConfigValueType,
  RuntimeGameProfile,
} from "../../../Common/Types/DataProtoType";

export type HoyoGameProfileId = "zzz" | "hsr" | "genshin";

export type HoyoLaunchMode = "steam-stub" | "jadeite" | "direct";

export type HoyoConfigValueType = RuntimeConfigValueType;

export interface HoyoConfigOptionDefinition extends RuntimeConfigOptionDefinition {
  type: HoyoConfigValueType;
}

export interface HoyoWineAutoArgsConfig {
  envName: string;
  disableEnvName: string;
  defaultDisabled: boolean;
}

export interface HoyoLaunchRoutineConfig {
  mode: HoyoLaunchMode;
  defaultLaunchOptions?: Partial<BottleLaunchOptionsPayload>;
  defaultExecutableArgs?: string[];
  dxmtConfig?: string;
  dxmtEnableNvExt?: boolean;
  optionalDxmtWindowsFiles?: string[];
  applyNvExtensionRegistry?: boolean;
  runtimeFilesToHide?: string[];
  wineAutoArgs?: HoyoWineAutoArgsConfig;
}

export interface HoyoGameProfile extends RuntimeGameProfile<HoyoGameProfileId> {
  kind: "game";
  id: HoyoGameProfileId;
  launchRoutine: HoyoLaunchRoutineConfig;
  configurableOptions: HoyoConfigOptionDefinition[];
}

export const HOYO_GAME_PROFILES = {
  zzz: ZZZ_HOYO_GAME_PROFILE,
  hsr: STARRAIL_HOYO_GAME_PROFILE,
  genshin: GENSHIN_HOYO_GAME_PROFILE,
} satisfies Record<HoyoGameProfileId, HoyoGameProfile>;

export function get_hoyo_game_profile(gameId: HoyoGameProfileId): HoyoGameProfile {
  return HOYO_GAME_PROFILES[gameId];
}
