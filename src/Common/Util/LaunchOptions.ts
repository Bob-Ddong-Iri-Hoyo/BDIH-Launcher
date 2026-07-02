import type {
  BottleLaunchOptionPresetId,
  BottleLaunchOptionsPayload,
  InstalledBottleAppPayload,
} from "../Types/IPC";
import type { WineLauncherOptionsManifest } from "../Types/Wine";

export const LAUNCH_OPTION_PRESET_IDS: BottleLaunchOptionPresetId[] = [
  "auto",
  "steam",
  "hoyoplay",
  "zzz",
  "hsr",
  "genshin",
  "custom",
];

const DEFAULT_EARLY_EXIT_WAIT_MS = 1200;
const HOYO_EARLY_EXIT_WAIT_MS = 5000;
const DXMT_HOYO_PREFERRED_MAX_FRAME_RATE = 60;
const LAUNCH_OPTION_MANIFEST_OPTION_NAMES: Partial<Record<keyof BottleLaunchOptionsPayload, string[]>> = {
  enableMsync: ["WINEMSYNC"],
  steamWebHelperArgs: ["WINE_STEAMWEBHELPER_ARGS", "WINE_STEAMWEBHELPER_ARGS_DISABLE"],
  hoyoplayInProcessGpu: ["WINE_HOYOPLAY_ARGS"],
  enableTimeoutFix: ["WINE_ENABLE_TIMEOUT_FIX"],
  leftCommandIsCtrl: ["WINEMAC_LEFT_COMMAND_IS_CTRL", "LEFT_COMMAND_IS_CTRL", "LeftCommandIsCtrl"],
  retinaMode: ["WINEMAC_RETINA_MODE", "RETINA_OVERRIDE", "RetinaMode"],
  metalHud: ["MTL_HUD_ENABLED", "METAL_HUD_OVERRIDE"],
  dxmtPreferredMaxFrameRate: ["DXMT_CONFIG"],
  dxmtMetalFxSpatialUpscale: ["DXMT_METALFX_SPATIAL_SWAPCHAIN", "DXMT_CONFIG"],
  dxmtMetalFxSpatialUpscaleFactor: ["DXMT_CONFIG"],
  superviseWaitSeconds: ["SUPERVISE_STEAM_WAIT_SECONDS"],
  networkGate: ["WINE_ENABLE_DISCONNECT"],
  networkGateSeconds: ["WINE_HOYO_DISCONNECT_SECONDS"],
  waitForManualNetworkCut: ["WAIT_FOR_MANUAL_NETWORK_CUT"],
  autoNetworkCut: ["AUTO_NETWORK_CUT"],
  autoNetworkReconnectSeconds: ["AUTO_NETWORK_RECONNECT_SECONDS"],
  allowDuplicateGame: ["SUPERVISOR_ALLOW_DUPLICATE_GAME"],
};

const PRESET_DEFAULTS: Record<Exclude<BottleLaunchOptionPresetId, "auto" | "custom">, BottleLaunchOptionsPayload> = {
  steam: {
    presetId: "steam",
    enableMsync: true,
    steamWebHelperArgs: true,
    earlyExitWaitMs: DEFAULT_EARLY_EXIT_WAIT_MS,
  },
  hoyoplay: {
    presetId: "hoyoplay",
    enableMsync: false,
    hoyoplayInProcessGpu: true,
    enableTimeoutFix: true,
    superviseWaitSeconds: 0,
    allowDuplicateGame: false,
    earlyExitWaitMs: HOYO_EARLY_EXIT_WAIT_MS,
    dxmtPreferredMaxFrameRate: DXMT_HOYO_PREFERRED_MAX_FRAME_RATE,
  },
  zzz: {
    presetId: "zzz",
    enableMsync: true,
    enableTimeoutFix: true,
    leftCommandIsCtrl: false,
    retinaMode: false,
    metalHud: false,
    networkGate: false,
    earlyExitWaitMs: HOYO_EARLY_EXIT_WAIT_MS,
  },
  hsr: {
    presetId: "hsr",
    enableMsync: false,
    enableTimeoutFix: true,
    networkGate: true,
    networkGateSeconds: 15,
    waitForManualNetworkCut: false,
    autoNetworkCut: false,
    autoNetworkReconnectSeconds: 20,
    earlyExitWaitMs: HOYO_EARLY_EXIT_WAIT_MS,
  },
  genshin: {
    presetId: "genshin",
    enableMsync: false,
    enableTimeoutFix: true,
    networkGate: false,
    earlyExitWaitMs: HOYO_EARLY_EXIT_WAIT_MS,
  },
};

type LaunchOptionAppIdentity = Pick<
  InstalledBottleAppPayload,
  "id" | "name" | "source" | "executablePath" | "steamAppId"
>;

export function default_launch_options_for_preset(
  presetId: BottleLaunchOptionPresetId,
): BottleLaunchOptionsPayload {
  if (presetId === "auto") {
    return { presetId: "auto", earlyExitWaitMs: DEFAULT_EARLY_EXIT_WAIT_MS };
  }

  if (presetId === "custom") {
    return { presetId: "custom", earlyExitWaitMs: DEFAULT_EARLY_EXIT_WAIT_MS };
  }

  return { ...PRESET_DEFAULTS[presetId] };
}

export function detect_launch_option_preset(
  app?: LaunchOptionAppIdentity,
): Exclude<BottleLaunchOptionPresetId, "auto" | "custom"> | undefined {
  const searchable = [
    app?.id,
    app?.name,
    app?.source,
    app?.executablePath,
    app?.steamAppId,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase()
    .replace(/\\/g, "/");

  if (app?.source === "steam" || app?.steamAppId || searchable.includes("steam")) {
    return "steam";
  }

  if (searchable.includes("starrail") || searchable.includes("star rail") || searchable.includes("hsr")) {
    return "hsr";
  }

  if (searchable.includes("zenless") || searchable.includes("zzz")) {
    return "zzz";
  }

  if (searchable.includes("genshin") || searchable.includes("yuanshen")) {
    return "genshin";
  }

  if (searchable.includes("hoyoplay") || searchable.includes("hoyo")) {
    return "hoyoplay";
  }

  return undefined;
}

export function resolve_launch_options_for_app(
  app?: LaunchOptionAppIdentity,
  options?: BottleLaunchOptionsPayload,
): BottleLaunchOptionsPayload {
  const requestedPreset = normalize_preset_id(options?.presetId);
  const basePreset =
    requestedPreset === "auto" || requestedPreset === "custom"
      ? detect_launch_option_preset(app)
      : requestedPreset;
  const baseOptions = basePreset
    ? default_launch_options_for_preset(basePreset)
    : default_launch_options_for_preset("auto");

  return normalize_launch_options({
    ...baseOptions,
    ...options,
    presetId: requestedPreset,
  }) ?? { presetId: requestedPreset };
}

export function launch_options_for_preset_selection(
  app: LaunchOptionAppIdentity | undefined,
  presetId: BottleLaunchOptionPresetId,
  currentOptions?: BottleLaunchOptionsPayload,
): BottleLaunchOptionsPayload {
  if (presetId === "custom") {
    return normalize_launch_options({
      ...resolve_launch_options_for_app(app, currentOptions),
      presetId: "custom",
    }) ?? { presetId: "custom" };
  }

  if (presetId === "auto") {
    return resolve_launch_options_for_app(app, { presetId: "auto" });
  }

  return normalize_launch_options(default_launch_options_for_preset(presetId)) ?? { presetId };
}

export function normalize_launch_options(
  options?: BottleLaunchOptionsPayload,
): BottleLaunchOptionsPayload | undefined {
  if (!options || typeof options !== "object") {
    return undefined;
  }

  return {
    presetId: normalize_preset_id(options.presetId),
    enableMsync: optional_boolean(options.enableMsync),
    steamWebHelperArgs: optional_boolean(options.steamWebHelperArgs),
    hoyoplayInProcessGpu: optional_boolean(options.hoyoplayInProcessGpu),
    enableTimeoutFix: optional_boolean(options.enableTimeoutFix),
    earlyExitWaitMs: optional_number(options.earlyExitWaitMs, 0, 60000),
    superviseWaitSeconds: optional_number(options.superviseWaitSeconds, 0, 3600),
    leftCommandIsCtrl: optional_boolean(options.leftCommandIsCtrl),
    retinaMode: optional_boolean(options.retinaMode),
    metalHud: optional_boolean(options.metalHud),
    dxmtPreferredMaxFrameRate: optional_number(options.dxmtPreferredMaxFrameRate, 0, 1000),
    dxmtMetalFxSpatialUpscale: optional_boolean(options.dxmtMetalFxSpatialUpscale),
    dxmtMetalFxSpatialUpscaleFactor: optional_number(options.dxmtMetalFxSpatialUpscaleFactor, 1, 4),
    networkGate: optional_boolean(options.networkGate),
    networkGateSeconds: optional_number(options.networkGateSeconds, 0, 120),
    waitForManualNetworkCut: optional_boolean(options.waitForManualNetworkCut),
    autoNetworkCut: optional_boolean(options.autoNetworkCut),
    autoNetworkReconnectSeconds: optional_number(options.autoNetworkReconnectSeconds, 0, 600),
    allowDuplicateGame: optional_boolean(options.allowDuplicateGame),
  };
}

export function is_launch_option_supported_by_manifest(
  key: keyof BottleLaunchOptionsPayload,
  manifest?: WineLauncherOptionsManifest,
): boolean {
  const requiredOptionNames = LAUNCH_OPTION_MANIFEST_OPTION_NAMES[key];

  if (!requiredOptionNames || requiredOptionNames.length === 0) {
    return true;
  }

  const manifestOptionNames = new Set(
    manifest?.groups.flatMap((group) => group.options.map((option) => option.name)) ?? [],
  );

  return requiredOptionNames.some((optionName) => manifestOptionNames.has(optionName));
}

export function filter_launch_options_by_manifest(
  options?: BottleLaunchOptionsPayload,
  manifest?: WineLauncherOptionsManifest,
): BottleLaunchOptionsPayload | undefined {
  const filteredOptions = normalize_launch_options(options);

  if (!filteredOptions) {
    return undefined;
  }

  for (const key of Object.keys(LAUNCH_OPTION_MANIFEST_OPTION_NAMES) as Array<keyof BottleLaunchOptionsPayload>) {
    if (!is_launch_option_supported_by_manifest(key, manifest)) {
      delete filteredOptions[key];
    }
  }

  return filteredOptions;
}

export function launch_option_preset_label(presetId: BottleLaunchOptionPresetId): string {
  switch (presetId) {
    case "auto":
      return "Auto";
    case "steam":
      return "Steam";
    case "hoyoplay":
      return "HoYoPlay";
    case "zzz":
      return "Zenless Zone Zero";
    case "hsr":
      return "Honkai: Star Rail";
    case "genshin":
      return "Genshin Impact";
    case "custom":
      return "Custom";
  }
}

function normalize_preset_id(value: unknown): BottleLaunchOptionPresetId {
  return LAUNCH_OPTION_PRESET_IDS.includes(value as BottleLaunchOptionPresetId)
    ? value as BottleLaunchOptionPresetId
    : "auto";
}

function optional_boolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optional_number(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}
