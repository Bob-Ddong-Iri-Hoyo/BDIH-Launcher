import type { BottleLaunchOptionsPayload } from "./IPC";




/**
 * Runtime App and Launcher Profile Types.
 * 
 * Currently Supported App and Launcher Profiles: 
 * Lanunchers : Steam, HoYoPlay
 * Games : Zenless Zone Zero, Honkai Star Rail, Genshin Impact, Eternal Return
 * 
 * Manager Searches This Profile at Main/Data Directory to get the Launcher and Game Profiles.
 * If you try to luanch unspported game or launchers, it might throw errors.
 * 
 *
 */


export type RuntimeProfileKind = "launcher" | "game";
export type RuntimeConfigValueType = "boolean" | "number" | "string" | "enum";
export type RuntimeLaunchOptionKey = Exclude<
  keyof BottleLaunchOptionsPayload,
  "presetId" | "environmentVariables"
>;

export interface RuntimeConfigChoice {
  label: string;
  value: string;
}

export interface RuntimeConfigOptionDefinition {
  key: string;
  label: string;
  type: RuntimeConfigValueType;
  description?: string;
  envName?: string;
  defaultValue?: boolean | number | string;
  choices?: RuntimeConfigChoice[];
}

export interface RuntimeLaunchRoutineConfig {
  mode: string;
  defaultLaunchOptions?: Partial<BottleLaunchOptionsPayload>;
  defaultExecutableArgs?: string[];
  dxmtConfig?: string;
  dxmtEnableNvExt?: boolean;
  optionalDxmtWindowsFiles?: string[];
  applyNvExtensionRegistry?: boolean;
  runtimeFilesToHide?: string[];
}

export type RuntimeDiscoveryDrive = "c";

export interface RuntimeExecutableDiscoveryDefinition {
  preferredRelativePaths: readonly string[];
  fallbackDrives: readonly RuntimeDiscoveryDrive[];
  maxDepth: number;
  maxEntries: number;
  skipDirectoryNames?: readonly string[];
}

export interface RuntimeLauncherProfile<
  Id extends string = string,
  ManagedId extends string = string,
> {
  kind: "launcher";
  id: Id;
  displayName: string;
  executableNames: string[];
  /**
   * Long-lived Windows processes that prove the launcher has actually started.
   * This can differ from the bootstrap executable used to launch it.
   */
  runningExecutableNames?: string[];
  executableDiscovery: RuntimeExecutableDiscoveryDefinition;
  managedGames?: ManagedId[];
  allowedLaunchOptionKeys: readonly RuntimeLaunchOptionKey[];
  configurableOptions: RuntimeConfigOptionDefinition[];
}

export interface RuntimeGameProfile<Id extends string = string> {
  kind: "game";
  id: Id;
  appId: string;
  displayName: string;
  prefixName: string;
  executableNames: string[];
  launchRoutine: RuntimeLaunchRoutineConfig;
  allowedLaunchOptionKeys: readonly RuntimeLaunchOptionKey[];
  configurableOptions: RuntimeConfigOptionDefinition[];
}
