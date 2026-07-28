import type { HoyoGameProfile } from "../HoyoGameProfile";

export const STARRAIL_HOYO_GAME_PROFILE = {
  kind: "game",
  id: "hsr",
  appId: "hoyo:hsr",
  displayName: "Honkai: Star Rail",
  prefixName: "hsr-prefix",
  executableNames: [
    "StarRail.exe",
  ],
  launchRoutine: {
    mode: "jadeite",
    defaultLaunchOptions: {
      enableMsync: false,
      enableTimeoutFix: true,
      networkGate: true,
      networkGateSeconds: 15,
      dxmtPreferredMaxFrameRate: 60,
    },
    defaultExecutableArgs: [
      "-disable-gpu-skinning",
    ],
    dxmtConfig: "d3d11.preferredMaxFrameRate=60;",
    optionalDxmtWindowsFiles: [
      "nvngx.dll",
    ],
    applyNvExtensionRegistry: true,
    runtimeFilesToHide: [
      "StarRail_Data/Plugins/x86_64/crashreport.exe",
      "StarRail_Data/Plugins/x86_64/vulkan-1.dll",
    ],
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
    "superviseWaitSeconds",
    "networkGate",
    "networkGateSeconds",
    "waitForManualNetworkCut",
    "autoNetworkCut",
    "autoNetworkReconnectSeconds",
    "allowDuplicateGame",
  ],
  configurableOptions: [
    {
      key: "dxmtPreferredMaxFrameRate",
      label: "DXMT preferred max frame rate",
      type: "number",
      envName: "DXMT_CONFIG",
      defaultValue: 60,
    },
    {
      key: "dxmtEnableNvExt",
      label: "DXMT NVExtension",
      type: "boolean",
      envName: "DXMT_ENABLE_NVEXT",
    },
    {
      key: "networkGate",
      label: "Network gate",
      type: "boolean",
      defaultValue: true,
    },
  ],
} satisfies HoyoGameProfile;
