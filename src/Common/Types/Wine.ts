export type InstallStatus =
  | "idle"
  | "available"
  | "downloading"
  | "installing"
  | "extracting"
  | "installed"
  | "completed"
  | "error";

export type WineType = "official" | "custom";

export type WineLauncherOptionValue = string | number | boolean | null;

export interface WineLauncherOptionPreset {
  id: string;
  label: string;
  value: string;
}

export interface WineLauncherOptionDefinition {
  name: string;
  type: string;
  values?: string[];
  default?: WineLauncherOptionValue;
  unsetBehavior?: WineLauncherOptionValue;
  owner?: string;
  scope?: string[];
  restartWineserver?: boolean;
  ui?: string;
  label?: string;
  description?: string;
  presets?: WineLauncherOptionPreset[];
}

export interface WineLauncherOptionGroup {
  id: string;
  title: string;
  options: WineLauncherOptionDefinition[];
}

export interface WineProcessTelemetryCapability {
  protocol: number;
  transport: "fifo";
  activationEnvironment: string;
  pipeEnvironment: string;
}

export interface WineHoyoPlayProxyCapability {
  protocol: number;
  relativePath: "share/bdhi/helpers/hoyoplay-proxy.exe";
  requiresProcessTelemetry: true;
}

export interface WineRuntimeCapabilities {
  bdihProcessTelemetry?: WineProcessTelemetryCapability;
  hoyoPlayProxy?: WineHoyoPlayProxyCapability;
}

export interface WineLauncherOptionsManifest {
  schemaVersion: number;
  id: string;
  name: string;
  wineFamilies?: string[];
  launcherContract?: Record<string, unknown>;
  capabilities?: WineRuntimeCapabilities;
  groups: WineLauncherOptionGroup[];
}

export interface WineVersion {
  id: string;
  name: string;
  version: string;
  status: InstallStatus;
  path?: string;
  progress: number;
  type: WineType;
  downloadUrl?: string;
  metadataUrl?: string;
  metadataPath?: string;
  launcherOptionsManifest?: WineLauncherOptionsManifest;
}

export interface DxmtVersion {
  id: string;
  name: string;
  version: string;
  status: InstallStatus;
  progress: number;
  downloadUrl?: string;
  path?: string;
}

export interface JadeiteVersion {
  id: string;
  name: string;
  version: string;
  status: InstallStatus;
  progress: number;
  downloadUrl?: string;
  path?: string;
}

export interface WineError {
  code: string;
  message: string;
}
