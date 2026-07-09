import type { HoyoGameProfile } from "./HoyoGameProfile";

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
    },
    defaultExecutableArgs: [
      "-disable-gpu-skinning",
    ],
    dxmtConfig: "d3d11.preferredMaxFrameRate=60;dxgi.customVendorId=10de;dxgi.customDeviceId=2684;",
    dxmtEnableNvExt: true,
    optionalDxmtWindowsFiles: [
      "nvngx.dll",
    ],
    applyNvExtensionRegistry: true,
    runtimeFilesToHide: [
      "StarRail_Data/Plugins/x86_64/crashreport.exe",
      "StarRail_Data/Plugins/x86_64/vulkan-1.dll",
    ],
  },
  configurableOptions: [
    {
      key: "dxmtPreferredMaxFrameRate",
      label: "DXMT preferred max frame rate",
      type: "number",
      envName: "DXMT_CONFIG",
      defaultValue: 60,
    },
    {
      key: "dxmtNvidiaVendorId",
      label: "DXMT NVIDIA vendor spoof",
      type: "boolean",
      envName: "DXMT_CONFIG",
      defaultValue: true,
      description: "Enables the NVIDIA vendor/device hints used by the Jadeite Star Rail launch path.",
    },
    {
      key: "dxmtEnableNvExt",
      label: "DXMT NVExtension",
      type: "boolean",
      envName: "DXMT_ENABLE_NVEXT",
      defaultValue: true,
    },
    {
      key: "networkGate",
      label: "Network gate",
      type: "boolean",
      defaultValue: true,
    },
  ],
} satisfies HoyoGameProfile;
