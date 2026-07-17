import type { HoyoGameProfile } from "../HoyoGameProfile";

export const GENSHIN_HOYO_GAME_PROFILE = {
  kind: "game",
  id: "genshin",
  appId: "hoyo:genshin",
  displayName: "Genshin Impact",
  prefixName: "genshin-prefix",
  executableNames: [
    "GenshinImpact.exe",
    "YuanShen.exe",
  ],
  launchRoutine: {
    mode: "steam-stub",
    defaultLaunchOptions: {
      enableMsync: false,
      enableTimeoutFix: false,
      networkGate: false,
    },
    defaultExecutableArgs: [],
    dxmtConfig: "d3d11.preferredMaxFrameRate=60;",
    runtimeFilesToHide: [
      "GenshinImpact_Data/upload_crash.exe",
      "GenshinImpact_Data/Plugins/crashreport.exe",
      "GenshinImpact_Data/Plugins/vulkan-1.dll",
    ],
    wineAutoArgs: {
      envName: "WINE_HOYO_GENSHIN_ARGS",
      disableEnvName: "WINE_HOYO_GENSHIN_ARGS_DISABLE",
      defaultDisabled: true,
    },
  },
  allowedLaunchOptionKeys: [
    "enableMsync",
    "enableTimeoutFix",
    "leftCommandIsCtrl",
    "retinaMode",
    "metalHud",
    "dxmtPreferredMaxFrameRate",
    "dxmtMetalFxSpatialUpscale",
    "dxmtMetalFxSpatialUpscaleFactor",
    "earlyExitWaitMs",
  ],
  configurableOptions: [
    {
      key: "dxmtPreferredMaxFrameRate",
      label: "DXMT preferred max frame rate",
      type: "number",
      envName: "DXMT_CONFIG",
      defaultValue: 60,
      description: "Caps the default DXMT frame pacing used for Genshin.",
    },
    {
      key: "wineHoyoGenshinArgs",
      label: "Wine Genshin argument append",
      type: "string",
      envName: "WINE_HOYO_GENSHIN_ARGS",
      description: "Optional Wine-side Genshin argument append. Disabled by default to avoid CEF/browser subprocess issues.",
    },
    {
      key: "wineHoyoGenshinArgsDisable",
      label: "Disable Wine Genshin argument append",
      type: "boolean",
      envName: "WINE_HOYO_GENSHIN_ARGS_DISABLE",
      defaultValue: true,
    },
  ],
} satisfies HoyoGameProfile;
