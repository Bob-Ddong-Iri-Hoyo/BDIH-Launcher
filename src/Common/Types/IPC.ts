import type { WineLauncherOptionsManifest } from "./Wine";

export type IpcDirection =
  | "RENDERER_TO_MAIN"
  | "MAIN_TO_RENDERER"
  | "BIDIRECTIONAL";
export type MethodType = "invoke" | "on" | "once" | "send";

export interface IpcChannelUnit<P = any> {
  readonly channelName: string; // 채널명
  readonly direction: IpcDirection; // 방향성 추가
  readonly method: MethodType;
  readonly payload: P; // 페이로드 타입 (추출용)
}
export interface WineInstallPayload {
  versionId: string;
  installPath: string;
}
export interface WineDeletePayload {
  versionId: string;
  installPath: string;
}
export interface RuntimeDeleteResultPayload {
  ok: boolean;
  deletedPaths: string[];
  error?: string;
}
// WINE 섹션
export interface WineChannelSchema {
  readonly INSTALL: IpcChannelUnit<WineInstallPayload>;
  readonly DELETE: IpcChannelUnit<WineDeletePayload>;
  readonly STATUS_UPDATE: IpcChannelUnit<WineStatusPayload>;
  readonly GET_VERSION_LIST: IpcChannelUnit<void>;
}

export interface DxmtInstallPayload {
  versionId: string;
  installPath: string;
}
export type DxmtDeletePayload = WineDeletePayload;

export interface JadeiteInstallPayload {
  versionId: string;
  installPath: string;
}
export type JadeiteDeletePayload = WineDeletePayload;

type WineStatus =
  | "installed"
  | "downloading"
  | "installing"
  | "extracting"
  | "completed"
  | "error";

export interface WineStatusPayload {
  versionId: string;
  status: WineStatus;
  progress: number;
  message?: string;
  path?: string;
  metadataPath?: string;
  launcherOptionsManifest?: WineLauncherOptionsManifest;
}

export type DxmtStatusPayload = WineStatusPayload;
export type JadeiteStatusPayload = WineStatusPayload;

export type AppUpdateStatus =
  | "disabled"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export interface AppUpdateStatusPayload {
  status: AppUpdateStatus;
  message?: string;
  version?: string;
  progress?: number;
  error?: string;
}

export const LAUNCHER_LOG_LEVELS = ["off", "error", "warn", "info", "debug", "all"] as const;
export type LauncherLogLevel = (typeof LAUNCHER_LOG_LEVELS)[number];
export const DEBUG_FLAG_MODES = ["preset", "wineDebug"] as const;
export type DebugFlagMode = (typeof DEBUG_FLAG_MODES)[number];
export const RENDERER_THEME_MODES = ["dark", "light", "system"] as const;
export type RendererThemeMode = (typeof RENDERER_THEME_MODES)[number];
export const LAUNCHER_SHORTCUT_ACTIONS = ["launch", "logs", "preferences"] as const;
export type LauncherShortcutAction = (typeof LAUNCHER_SHORTCUT_ACTIONS)[number];
export type LauncherShortcutMap = Record<LauncherShortcutAction, string>;

export interface LauncherPreferencePayload {
  language: string;
  accentColor: string;
  dataRootPath: string;
  wineInstallPath: string;
  bottlePrefixPath: string;
  dxmtCachePath: string;
  gameInstallPath: string;
  autoCheckUpdates: boolean;
  closeToTray: boolean;
  themeMode: RendererThemeMode;
  appLoggingLevel: LauncherLogLevel;
  debugFlagMode: DebugFlagMode;
  loggingLevel: LauncherLogLevel;
  wineDebugArgs: string;
  shortcuts: LauncherShortcutMap;
}

export type LauncherPreferencePatch = Partial<LauncherPreferencePayload>;

export interface SelectDirectoryPayload {
  title?: string;
  defaultPath?: string;
}

export interface SelectDirectoryResultPayload {
  canceled: boolean;
  path?: string;
}

export interface SelectFilePayload {
  title?: string;
  defaultPath?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
}

export interface SelectFileResultPayload {
  canceled: boolean;
  path?: string;
}

export interface PathSuggestionPayload {
  value: string;
  defaultPath?: string;
  limit?: number;
}

export interface PathSuggestionItemPayload {
  path: string;
  name: string;
  isDirectory: boolean;
}

export interface PathSuggestionResultPayload {
  suggestions: PathSuggestionItemPayload[];
}

export type LauncherDataDeleteTarget = "wineRuntime" | "bottlePrefixes" | "dxmtCache" | "settings" | "logs" | "all";

export interface DeleteLauncherDataPayload {
  targets?: LauncherDataDeleteTarget[];
  dataRootPath?: string;
  wineInstallPath?: string;
  bottlePrefixPath?: string;
  dxmtCachePath?: string;
}

export interface DeleteLauncherDataResultPayload {
  deletedPaths: string[];
  skippedPaths: Array<{
    path: string;
    reason: string;
  }>;
  failedPaths: Array<{
    path: string;
    error: string;
  }>;
}

export interface OpenPathPayload {
  path?: string;
}

export interface OpenExternalUrlPayload {
  url: string;
}

export type RosettaStatus = "not-required" | "installed" | "missing" | "error";

export interface RosettaStatusPayload {
  status: RosettaStatus;
  isAppleSilicon: boolean;
  installCommand: string;
  error?: string;
}

export type LocaleResourcesPayload = Record<string, {
  translation: Record<string, unknown>;
}>;

export type LauncherLogEntryLevel = "debug" | "info" | "warn" | "error";
export type LauncherLogEntryCategory = "app" | "wine";

export interface LauncherLogEntryPayload {
  id: string;
  sessionId: string;
  timestamp: string;
  level: LauncherLogEntryLevel;
  category: LauncherLogEntryCategory;
  source: string;
  message: string;
  bottleId?: string;
  bottleName?: string;
}

export type RendererConsoleLogLevel = "debug" | "info" | "log" | "warn" | "error";

export interface RendererLogPayload {
  level: RendererConsoleLogLevel;
  source?: string;
  args: unknown[];
}

export interface LauncherLogSessionPayload {
  id: string;
  label: string;
  startedAt: string;
  logFileName?: string;
  logFilePath?: string;
  logDirectoryPath?: string;
  kind: "app" | "bottle";
  bottleId?: string;
  bottleName?: string;
  count: number;
  isRunning: boolean;
}

export interface LauncherLogSourcePayload {
  id: string;
  label: string;
  count: number;
}

export interface LauncherLogSnapshotPayload {
  entries: LauncherLogEntryPayload[];
  sessions: LauncherLogSessionPayload[];
  sources: LauncherLogSourcePayload[];
}

export interface RunBottleExecutablePayload {
  bottleId: string;
  bottleName: string;
  bottlePath: string;
  wineVersionId: string;
  wineRuntimePath?: string;
  dxmtVersionId?: string;
  dxmtPackagePath?: string;
  jadeiteVersionId?: string;
  jadeiteRuntimePath?: string;
  launcherOptionsManifest?: WineLauncherOptionsManifest;
  appId?: string;
  appName?: string;
  executablePath: string;
  executableArgs?: string[];
  launchOptions?: BottleLaunchOptionsPayload;
}

export interface StopBottleProcessPayload {
  processId: string;
}

export interface DeleteBottlePayload {
  bottleId: string;
  bottlePath: string;
  bottleName?: string;
}

export interface DeleteBottleResultPayload {
  ok: boolean;
  deletedPath?: string;
  deletedLogPaths?: string[];
  error?: string;
}

export interface DeleteBottleAppPayload {
  bottleId: string;
  bottlePath: string;
  appId: string;
}

export interface DeleteBottleAppResultPayload {
  ok: boolean;
  deletedPaths: string[];
  skippedPaths: Array<{
    path: string;
    reason: string;
  }>;
  error?: string;
}

export interface BottleProcessExitPayload {
  processId: string;
  code?: number;
  error?: string;
}

export type BottleLauncherKind = "steam" | "hoyoplay";

export interface BottlePrefixSessionPayload {
  bottleId: string;
  bottleName: string;
  prefixPath: string;
  processId: string;
  isRunning: boolean;
  launcher?: BottleLauncherKind;
  appId?: string;
  appName?: string;
  startedAt?: string;
  endedAt?: string;
  error?: string;
}

export type BottleLaunchOptionPresetId =
  | "auto"
  | "steam"
  | "hoyoplay"
  | "zzz"
  | "hsr"
  | "genshin"
  | "custom";

export interface BottleLaunchOptionsPayload {
  presetId?: BottleLaunchOptionPresetId;
  enableMsync?: boolean;
  steamWebHelperArgs?: boolean;
  hoyoplayInProcessGpu?: boolean;
  enableTimeoutFix?: boolean;
  earlyExitWaitMs?: number;
  superviseWaitSeconds?: number;
  leftCommandIsCtrl?: boolean;
  retinaMode?: boolean;
  metalHud?: boolean;
  dxmtPreferredMaxFrameRate?: number;
  dxmtMetalFxSpatialUpscale?: boolean;
  dxmtMetalFxSpatialUpscaleFactor?: number;
  networkGate?: boolean;
  networkGateSeconds?: number;
  waitForManualNetworkCut?: boolean;
  autoNetworkCut?: boolean;
  autoNetworkReconnectSeconds?: number;
  allowDuplicateGame?: boolean;
}
export type BottleTaskStage =
  | "setup"
  | "dxmt"
  | "download"
  | "install"
  | "ready"
  | "error";

export interface SetupBottlePrefixPayload {
  bottleId: string;
  bottleName: string;
  bottlePath: string;
  wineVersionId: string;
  wineRuntimePath?: string;
  dxmtVersionId?: string;
  dxmtPackagePath?: string;
  jadeiteVersionId?: string;
  jadeiteRuntimePath?: string;
  launcherOptionsManifest?: WineLauncherOptionsManifest;
}

export interface InstallBottleLauncherPayload extends SetupBottlePrefixPayload {
  launcher: BottleLauncherKind;
}

export interface BottleTaskStatusPayload {
  bottleId: string;
  launcher?: BottleLauncherKind;
  stage: BottleTaskStage;
  progress: number;
  message?: string;
}

export interface BottleTaskStatePayload {
  stage: BottleTaskStage;
  progress: number;
  message?: string;
}

export interface InstalledBottleAppPayload {
  id: string;
  name: string;
  subtitle: string;
  wineVersionId: string;
  executablePath?: string;
  executableArgs?: string[];
  launchOptions?: BottleLaunchOptionsPayload;
  iconSrc?: string;
  source?: "launcher" | "steam" | "game" | "manual";
  steamAppId?: string;
  lastPlayed: string;
  lastPlayedKey?: string;
  status: "ready" | "needs-prefix" | "updating";
  processId?: string;
  launchError?: string;
}

export interface BottleMetadataPayload {
  id: string;
  name: string;
  description: string;
  wineVersionId: string;
  dxmtVersionId?: string;
  jadeiteVersionId?: string;
  path: string;
  prefixPath?: string;
  status: "ready" | "needs-setup" | "updating";
  setupTask?: BottleTaskStatePayload;
  launcherTasks?: Partial<Record<BottleLauncherKind, BottleTaskStatePayload>>;
  loggingLevelOverride?: LauncherLogLevel;
  wineDebugArgsOverride?: string;
  apps: InstalledBottleAppPayload[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BottleListPayload {
  bottles: BottleMetadataPayload[];
}

export interface OpenPathResultPayload {
  ok: boolean;
  path?: string;
  error?: string;
}

export interface RunBottleExecutableResultPayload {
  ok: boolean;
  processId?: string;
  error?: string;
}

export interface BottleTaskResultPayload {
  ok: boolean;
  refreshBottles?: boolean;
  error?: string;
}

export interface YouTubeLiveStatusRequest {
  channelId?: string;
  handle?: string;
}

export interface YouTubeLiveStatusPayload {
  isLive: boolean;
  channelId?: string;
  checkedAt: string;
  error?: string;
}

///

// APP 섹션 전체의 규격
export interface AppChannelSchema {
  readonly QUIT: IpcChannelUnit<void>;
  readonly MINIMIZE: IpcChannelUnit<void>;
  readonly MAXIMIZE: IpcChannelUnit<void>;
  readonly RESTART: IpcChannelUnit<void>;
  readonly UPDATE: IpcChannelUnit<void>;
  readonly GET_ROSETTA_STATUS: IpcChannelUnit<void>;
  readonly CONTINUE_AFTER_ROSETTA_GATE: IpcChannelUnit<void>;
  readonly GET_LOCALE_RESOURCES: IpcChannelUnit<void>;
  readonly UPDATE_STATUS: IpcChannelUnit<AppUpdateStatusPayload>;
  readonly GET_PREFERENCE: IpcChannelUnit<void>;
  readonly UPDATE_PREFERENCE: IpcChannelUnit<LauncherPreferencePatch>;
  readonly SELECT_DIRECTORY: IpcChannelUnit<SelectDirectoryPayload>;
  readonly SELECT_FILE: IpcChannelUnit<SelectFilePayload>;
  readonly SUGGEST_PATHS: IpcChannelUnit<PathSuggestionPayload>;
  readonly DELETE_LAUNCHER_DATA: IpcChannelUnit<DeleteLauncherDataPayload>;
  readonly OPEN_LOG_FOLDER: IpcChannelUnit<void>;
  readonly GET_LOG_SNAPSHOT: IpcChannelUnit<void>;
  readonly LOG_UPDATE: IpcChannelUnit<LauncherLogEntryPayload>;
  readonly RENDERER_LOG: IpcChannelUnit<RendererLogPayload>;
  readonly OPEN_PATH: IpcChannelUnit<OpenPathPayload>;
  readonly REVEAL_PATH: IpcChannelUnit<OpenPathPayload>;
  readonly OPEN_EXTERNAL_URL: IpcChannelUnit<OpenExternalUrlPayload>;
}

export interface YouTubeChannelSchema {
  readonly GET_LIVE_STATUS: IpcChannelUnit<YouTubeLiveStatusRequest>;
}

export interface BottleChannelSchema {
  readonly GET_LIST: IpcChannelUnit<void>;
  readonly SAVE_LIST: IpcChannelUnit<BottleListPayload>;
  readonly DELETE: IpcChannelUnit<DeleteBottlePayload>;
  readonly DELETE_APP: IpcChannelUnit<DeleteBottleAppPayload>;
  readonly RUN_EXECUTABLE: IpcChannelUnit<RunBottleExecutablePayload>;
  readonly STOP_PROCESS: IpcChannelUnit<StopBottleProcessPayload>;
  readonly SETUP_PREFIX: IpcChannelUnit<SetupBottlePrefixPayload>;
  readonly INSTALL_LAUNCHER: IpcChannelUnit<InstallBottleLauncherPayload>;
  readonly STATUS_UPDATE: IpcChannelUnit<BottleTaskStatusPayload>;
  readonly PROCESS_EXIT: IpcChannelUnit<BottleProcessExitPayload>;
  readonly PREFIX_SESSION_UPDATE: IpcChannelUnit<BottlePrefixSessionPayload>;
}

export interface DxmtChannelSchema {
  readonly INSTALL: IpcChannelUnit<DxmtInstallPayload>;
  readonly DELETE: IpcChannelUnit<DxmtDeletePayload>;
  readonly STATUS_UPDATE: IpcChannelUnit<DxmtStatusPayload>;
  readonly GET_VERSION_LIST: IpcChannelUnit<void>;
}

export interface JadeiteChannelSchema {
  readonly INSTALL: IpcChannelUnit<JadeiteInstallPayload>;
  readonly DELETE: IpcChannelUnit<JadeiteDeletePayload>;
  readonly STATUS_UPDATE: IpcChannelUnit<JadeiteStatusPayload>;
  readonly GET_VERSION_LIST: IpcChannelUnit<void>;
}

// 2. 요청/응답 페이로드 타입
export interface InstallRequest {
  versionId: string;
  installPath: string;
}

export interface StatusUpdatePayload {
  versionId: string;
  status: WineStatus;
  progress: number;
  message?: string;
}

////////////////////////////////////////////////////////
//                  LITERAL TYPE DEFINITION           //
////////////////////////////////////////////////////////

// 1. 채널명 정의 (String Enum 또는 상수 객체)
export const WINE = {
  INSTALL: {
    channelName: "wine:install",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as WineInstallPayload,
  },
  DELETE: {
    channelName: "wine:delete",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as WineDeletePayload,
  },
  STATUS_UPDATE: {
    channelName: "wine:status-update",
    method: "on",
    direction: "MAIN_TO_RENDERER",
    payload: {} as WineStatusPayload,
  },
  GET_VERSION_LIST: {
    channelName: "wine:get-list",
    method: "invoke",
    direction: "MAIN_TO_RENDERER",
    payload: {} as never,
  },
} as const;

export const DXMT = {
  INSTALL: {
    channelName: "dxmt:install",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as DxmtInstallPayload,
  },
  DELETE: {
    channelName: "dxmt:delete",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as DxmtDeletePayload,
  },
  STATUS_UPDATE: {
    channelName: "dxmt:status-update",
    method: "on",
    direction: "MAIN_TO_RENDERER",
    payload: {} as DxmtStatusPayload,
  },
  GET_VERSION_LIST: {
    channelName: "dxmt:get-list",
    method: "invoke",
    direction: "MAIN_TO_RENDERER",
    payload: {} as never,
  },
} as const;

export const JADEITE = {
  INSTALL: {
    channelName: "jadeite:install",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as JadeiteInstallPayload,
  },
  DELETE: {
    channelName: "jadeite:delete",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as JadeiteDeletePayload,
  },
  STATUS_UPDATE: {
    channelName: "jadeite:status-update",
    method: "on",
    direction: "MAIN_TO_RENDERER",
    payload: {} as JadeiteStatusPayload,
  },
  GET_VERSION_LIST: {
    channelName: "jadeite:get-list",
    method: "invoke",
    direction: "RENDERER_TO_MAIN",
    payload: {} as never,
  },
} as const;

export const BOTTLE = {
  GET_LIST: {
    channelName: "bottle:get-list",
    method: "invoke",
    direction: "RENDERER_TO_MAIN",
    payload: {} as never,
  },
  SAVE_LIST: {
    channelName: "bottle:save-list",
    method: "invoke",
    direction: "RENDERER_TO_MAIN",
    payload: {} as BottleListPayload,
  },
  DELETE: {
    channelName: "bottle:delete",
    method: "invoke",
    direction: "RENDERER_TO_MAIN",
    payload: {} as DeleteBottlePayload,
  },
  DELETE_APP: {
    channelName: "bottle:delete-app",
    method: "invoke",
    direction: "RENDERER_TO_MAIN",
    payload: {} as DeleteBottleAppPayload,
  },
  RUN_EXECUTABLE: {
    channelName: "bottle:run-executable",
    method: "invoke",
    direction: "RENDERER_TO_MAIN",
    payload: {} as RunBottleExecutablePayload,
  },
  STOP_PROCESS: {
    channelName: "bottle:stop-process",
    method: "invoke",
    direction: "RENDERER_TO_MAIN",
    payload: {} as StopBottleProcessPayload,
  },
  SETUP_PREFIX: {
    channelName: "bottle:setup-prefix",
    method: "invoke",
    direction: "RENDERER_TO_MAIN",
    payload: {} as SetupBottlePrefixPayload,
  },
  INSTALL_LAUNCHER: {
    channelName: "bottle:install-launcher",
    method: "invoke",
    direction: "RENDERER_TO_MAIN",
    payload: {} as InstallBottleLauncherPayload,
  },
  STATUS_UPDATE: {
    channelName: "bottle:status-update",
    method: "on",
    direction: "MAIN_TO_RENDERER",
    payload: {} as BottleTaskStatusPayload,
  },
  PROCESS_EXIT: {
    channelName: "bottle:process-exit",
    method: "on",
    direction: "MAIN_TO_RENDERER",
    payload: {} as BottleProcessExitPayload,
  },
  PREFIX_SESSION_UPDATE: {
    channelName: "bottle:prefix-session-update",
    method: "on",
    direction: "MAIN_TO_RENDERER",
    payload: {} as BottlePrefixSessionPayload,
  },
} as const;

////////////////////////////////////
// App Channel Definition
////////////////////////////////////
export const APP = {
  QUIT: {
    channelName: "app:quit",
    method: "send",
    direction: "RENDERER_TO_MAIN",
    payload: {} as never,
  },
  MINIMIZE: {
    channelName: "app:minimize",
    direction: "RENDERER_TO_MAIN",
    method: "send",
    payload: {} as never,
  },
  MAXIMIZE: {
    channelName: "app:maximize",
    direction: "RENDERER_TO_MAIN",
    method: "send",
    payload: {} as never,
  },
  RESTART: {
    channelName: "app:restart",
    direction: "RENDERER_TO_MAIN",
    method: "send",
    payload: {} as never,
  },
  UPDATE: {
    channelName: "app:update",
    direction: "RENDERER_TO_MAIN",
    method: "send",
    payload: {} as never,
  },
  GET_ROSETTA_STATUS: {
    channelName: "app:get-rosetta-status",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as never,
  },
  CONTINUE_AFTER_ROSETTA_GATE: {
    channelName: "app:continue-after-rosetta-gate",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as never,
  },
  GET_LOCALE_RESOURCES: {
    channelName: "app:get-locale-resources",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as never,
  },
  UPDATE_STATUS: {
    channelName: "app:update-status",
    direction: "MAIN_TO_RENDERER",
    method: "on",
    payload: {} as AppUpdateStatusPayload,
  },
  GET_PREFERENCE: {
    channelName: "app:get-preference",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as never,
  },
  UPDATE_PREFERENCE: {
    channelName: "app:update-preference",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as LauncherPreferencePatch,
  },
  SELECT_DIRECTORY: {
    channelName: "app:select-directory",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as SelectDirectoryPayload,
  },
  SELECT_FILE: {
    channelName: "app:select-file",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as SelectFilePayload,
  },
  SUGGEST_PATHS: {
    channelName: "app:suggest-paths",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as PathSuggestionPayload,
  },
  DELETE_LAUNCHER_DATA: {
    channelName: "app:delete-launcher-data",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as DeleteLauncherDataPayload,
  },
  OPEN_LOG_FOLDER: {
    channelName: "app:open-log-folder",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as never,
  },
  GET_LOG_SNAPSHOT: {
    channelName: "app:get-log-snapshot",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as never,
  },
  LOG_UPDATE: {
    channelName: "app:log-update",
    direction: "MAIN_TO_RENDERER",
    method: "on",
    payload: {} as LauncherLogEntryPayload,
  },
  RENDERER_LOG: {
    channelName: "app:renderer-log",
    direction: "RENDERER_TO_MAIN",
    method: "send",
    payload: {} as RendererLogPayload,
  },
  OPEN_PATH: {
    channelName: "app:open-path",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as OpenPathPayload,
  },
  REVEAL_PATH: {
    channelName: "app:reveal-path",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as OpenPathPayload,
  },
  OPEN_EXTERNAL_URL: {
    channelName: "app:open-external-url",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as OpenExternalUrlPayload,
  },
} as const;

export const YOUTUBE = {
  GET_LIVE_STATUS: {
    channelName: "youtube:get-live-status",
    direction: "RENDERER_TO_MAIN",
    method: "invoke",
    payload: {} as YouTubeLiveStatusRequest,
  },
} as const;

export const IPC_CHANNELS = {
  WINE,
  DXMT,
  JADEITE,
  BOTTLE,
  APP,
  YOUTUBE,
} as const;

/////////

type ChannelUnitUnion = {
  [Domain in keyof typeof IPC_CHANNELS]: (typeof IPC_CHANNELS)[Domain][keyof (typeof IPC_CHANNELS)[Domain]];
}[keyof typeof IPC_CHANNELS];

type FindChannelNameByMethodType<M extends MethodType> = Extract<
  ChannelUnitUnion,
  { method: M }
>["channelName"];

/**
 * Alias Helper Types
 */
export type InvokeChannelNames = FindChannelNameByMethodType<"invoke">;
export type SendChannelNames = FindChannelNameByMethodType<"send">;
export type OnChannelNames = FindChannelNameByMethodType<"on">;

type FindChannelInfoByName<C extends string> = Extract<ChannelUnitUnion, { channelName: C }>;

export type PayloadOf<T extends string> =
  FindChannelInfoByName<T> extends { payload: infer P } ? P : never;

// GOod GoOd GoOd GooD
// type isnstallCommandTest = PayloadOf<"wine:install">;
