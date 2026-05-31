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
// WINE 섹션
export interface WineChannelSchema {
  readonly INSTALL: IpcChannelUnit<WineInstallPayload>;
  readonly STATUS_UPDATE: IpcChannelUnit<WineStatusPayload>;
  readonly GET_VERSION_LIST: IpcChannelUnit<void>;
}

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
}

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

export interface LauncherPreferencePayload {
  language: string;
  wineInstallPath: string;
  gameInstallPath: string;
  autoCheckUpdates: boolean;
  closeToTray: boolean;
}

export type LauncherPreferencePatch = Partial<LauncherPreferencePayload>;

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
  readonly UPDATE_STATUS: IpcChannelUnit<AppUpdateStatusPayload>;
  readonly GET_PREFERENCE: IpcChannelUnit<void>;
  readonly UPDATE_PREFERENCE: IpcChannelUnit<LauncherPreferencePatch>;
}

export interface YouTubeChannelSchema {
  readonly GET_LIVE_STATUS: IpcChannelUnit<YouTubeLiveStatusRequest>;
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
  APP,
  YOUTUBE,
} as const;

/////////

type AllDomains = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// Flatten complicated Nested Union Types like ... {A} | {B} to  A | B
// I Used Function argument Inference
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

type DomainUnionKeyType = UnionToIntersection<AllDomains>;
type AnyDomainUint = DomainUnionKeyType extends any
  ? DomainUnionKeyType[keyof DomainUnionKeyType]
  : never;

type FindChannelNameByMethodType<M extends MethodType> = {
  [K in keyof DomainUnionKeyType]: DomainUnionKeyType[K] extends { method: M }
    ? DomainUnionKeyType[K]["channelName"]
    : never;
}[keyof DomainUnionKeyType];

/**
 * Alias Helper Types
 */
export type InvokeChannelNames = FindChannelNameByMethodType<"invoke">;
export type SendChannelNames = FindChannelNameByMethodType<"send">;
export type OnChannelNames = FindChannelNameByMethodType<"on">;

type FindChannelInfoByName<C extends string> = Extract<
  AnyDomainUint,
  { channelName: C }
>;

export type PayloadOf<T extends string> =
  FindChannelInfoByName<T> extends { payload: infer P } ? P : never;

// GOod GoOd GoOd GooD
// type isnstallCommandTest = PayloadOf<"wine:install">;
