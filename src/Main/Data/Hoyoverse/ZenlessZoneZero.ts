import type { HoyoGameProfile } from "./HoyoGameProfile";

export const ZZZ_HOYO_GAME_PROFILE = {
  kind: "game",
  id: "zzz",
  appId: "hoyo:zzz",
  displayName: "Zenless Zone Zero",
  prefixName: "zzz-prefix",
  executableNames: [
    "ZenlessZoneZero.exe",
    "ZenlessZoneZeroBeta.exe",
  ],
  launchRoutine: {
    mode: "steam-stub",
    defaultLaunchOptions: {
      enableMsync: false,
      enableTimeoutFix: true,
      networkGate: false,
    },
    defaultExecutableArgs: [],
    dxmtConfig: "d3d11.preferredMaxFrameRate=60;",
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
    },
    {
      key: "enableMsync",
      label: "Wine msync",
      type: "boolean",
      envName: "WINEMSYNC",
      defaultValue: false,
    },
  ],
} satisfies HoyoGameProfile;
