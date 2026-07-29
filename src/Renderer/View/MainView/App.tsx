import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import "../../style/index.css";
import { BDIH_YOUTUBE_HANDLE, STEAM_GAME_LAUNCH_ARGUMENT } from "../../../Common/Constant/RuntimeSources";
import { AppUpdateInstallProgressPayload, AppUpdateStatusPayload, BottleExecutionAvailabilityPayload, BottleExecutionStatePayload, BottleLaunchOptionsPayload, BottleLauncherKind, BottleListPayload, BottlePrefixMetadataPayload, BottlePrefixSessionPayload, BottleProcessExitPayload, BottleTaskResultPayload, BottleTaskStatusPayload, DEBUG_FLAG_MODES, DebugFlagMode, DeleteBottlePrefixResultPayload, DeleteLauncherDataResultPayload, IPC_CHANNELS, LAUNCHER_LOG_LEVELS, LAUNCHER_SHORTCUT_ACTIONS, LAUNCHER_WINDOW_DEFAULT_SIZE, LAUNCHER_WINDOW_MIN_SIZE, LAUNCHER_WINDOW_STARTUP_SIZE_MODES, LauncherDataDeleteTarget, LauncherLogEntryPayload, LauncherLogLevel, LauncherLogSnapshotPayload, LauncherPreferencePayload, LauncherShortcutAction, LauncherShortcutMap, LauncherWindowStartupSizeMode, RENDERER_THEME_MODES, RendererThemeMode, SelectDirectoryResultPayload, SelectFileResultPayload, YouTubeLiveStatusPayload } from "../../../Common/Types/IPC";
import {
  bottle_name_to_slug,
  create_bottle_app_prefix_path,
  create_bottle_storage_path,
  create_default_wine_prefix_path,
  create_launcher_prefix_path,
  executable_path_for_wine_prefix,
  launcher_from_bottle_app,
  normalize_bottle_prefix_root,
} from "../../../Common/Util/BottlePath";
import { pick_bottle_icon_id } from "../../../Common/Util/BottleIcon";
import { manual_app_id_from_executable_path } from "../../../Common/Util/ExecutablePath";
import { Dialog } from "../../Component/Dialog";
import { AppUpdateInstallDialog } from "../../Component/AppUpdateInstallDialog";
import { RuntimeInstallFailureDialog } from "../../Component/RuntimeInstallFailureDialog";
import type { LogEntry, LogSession, LogSourceOption } from "../../Component/LogViewer";
import { RendererViewKey } from "../../Component/MainFrame";
import { ProgressBar } from "../../Component/ProgressBar";
import { Stack, Text } from "../../Component/Primitives";
import { change_renderer_locale, is_supported_locale, resolve_initial_locale, SupportedLocale } from "../../I18n";
import { useSystemStore } from "../../Store";
import { AccentColor, apply_renderer_accent_color, is_accent_color, resolve_initial_accent_color } from "../../Theme";
import { normalize_preference_path, preference_storage_paths_equal } from "../../Util/PreferencePath";
import {
  initial_running_state_for_live_log_entry,
  running_state_after_live_log_entry,
} from "../../Util/LogSessionActivity";
import {
  app_ids_from_prefix_session,
  apply_execution_state_to_bottles,
} from "../../Logic/BottleExecutionState";
import { LauncherView } from "./MainView";
import type { Bottle, CreateBottleInput } from "./MainView";
import type { PreferencePathKey } from "../PreferenceView/PreferenceView";

const DEFAULT_DATA_ROOT_PATH = "~/Library/Application Support/BDIH Launcher";
const DEFAULT_WINE_INSTALL_PATH = create_data_root_child_path(DEFAULT_DATA_ROOT_PATH, "Wine");
const DEFAULT_BOTTLE_PREFIX_PATH = create_data_root_child_path(DEFAULT_DATA_ROOT_PATH, "Bottles");
const DEFAULT_DXMT_CACHE_PATH = create_data_root_child_path(DEFAULT_DATA_ROOT_PATH, "DXMT");
const DEFAULT_GAME_INSTALL_PATH = create_data_root_child_path(DEFAULT_DATA_ROOT_PATH, "Games");
const DEFAULT_JADEITE_INSTALL_PATH = create_data_root_child_path(DEFAULT_DATA_ROOT_PATH, "dependencies/jadeite");
const DEFAULT_SHORTCUTS: LauncherShortcutMap = {
  launch: "Command + Return",
  logs: "Command + L",
  preferences: "Command + ,",
  logFind: "Command + F",
  logFindNext: "Command + N",
  logFindPrevious: "Command + P",
};
const DEVELOPER_YOUTUBE_HANDLE = BDIH_YOUTUBE_HANDLE;
const YOUTUBE_LIVE_REFRESH_INTERVAL_MS = 60_000;
const UPDATE_STATUS_REFRESH_INTERVAL_MS = 10 * 60_000;

interface PreferenceDraftSnapshot {
  locale: SupportedLocale;
  accentColor: AccentColor;
  themeMode: RendererThemeMode;
  appLoggingLevel: LauncherLogLevel;
  debugFlagMode: DebugFlagMode;
  loggingLevel: LauncherLogLevel;
  wineDebugArgs: string;
  shortcuts: LauncherShortcutMap;
  autoUpdateEnabled: boolean;
  closeToTray: boolean;
  windowStartupSizeMode: LauncherWindowStartupSizeMode;
  windowStartupCustomWidth: number;
  windowStartupCustomHeight: number;
  dataRootPath: string;
  installPath: string;
  bottlePrefixPath: string;
  dxmtCachePath: string;
  gameInstallPath: string;
}

interface PendingLauncherExecutableConfirmation {
  bottleId: string;
  launcher: BottleLauncherKind;
  installerPath: string;
}

type RendererConsoleMethod = "debug" | "info" | "log" | "warn" | "error";

interface RendererConsoleBridgeWindow extends Window {
  __BDIH_RENDERER_CONSOLE_BRIDGE_INSTALLED__?: boolean;
}

function serialize_renderer_console_arg(value: unknown): unknown {
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function install_renderer_console_bridge(): void {
  if (typeof window === "undefined" || !window.BTIH_API) {
    return;
  }

  const bridgeWindow = window as RendererConsoleBridgeWindow;

  if (bridgeWindow.__BDIH_RENDERER_CONSOLE_BRIDGE_INSTALLED__) {
    return;
  }

  bridgeWindow.__BDIH_RENDERER_CONSOLE_BRIDGE_INSTALLED__ = true;

  const rendererConsole = console as Record<RendererConsoleMethod, (...args: unknown[]) => void>;
  const originalConsole: Record<RendererConsoleMethod, (...args: unknown[]) => void> = {
    debug: rendererConsole.debug.bind(console),
    info: rendererConsole.info.bind(console),
    log: rendererConsole.log.bind(console),
    warn: rendererConsole.warn.bind(console),
    error: rendererConsole.error.bind(console),
  };
  const sendRendererLog = (level: RendererConsoleMethod, args: unknown[]): void => {
    window.BTIH_API.send(IPC_CHANNELS.APP.RENDERER_LOG.channelName, {
      level,
      source: "renderer",
      args: args.map(serialize_renderer_console_arg),
    });
  };

  (["debug", "info", "log", "warn", "error"] as RendererConsoleMethod[]).forEach((method) => {
    rendererConsole[method] = (...args: unknown[]) => {
      originalConsole[method](...args);

      try {
        sendRendererLog(method, args);
      } catch {
        // Console output must never break renderer behavior, especially in
        // Storybook or browser-only previews where Electron IPC is unavailable.
      }
    };
  });

  window.addEventListener("error", (event) => {
    try {
      sendRendererLog("error", ["window.error", event.message, event.filename, event.lineno, event.colno, event.error]);
    } catch {
      // Keep native renderer error handling untouched if logging fails.
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    try {
      sendRendererLog("error", ["window.unhandledrejection", event.reason]);
    } catch {
      // Keep native renderer rejection handling untouched if logging fails.
    }
  });
}

install_renderer_console_bridge();

function is_launcher_log_level(value: unknown): value is LauncherLogLevel {
  return typeof value === "string" && LAUNCHER_LOG_LEVELS.includes(value as LauncherLogLevel);
}

function is_debug_flag_mode(value: unknown): value is DebugFlagMode {
  return typeof value === "string" && DEBUG_FLAG_MODES.includes(value as DebugFlagMode);
}

function is_renderer_theme_mode(value: unknown): value is RendererThemeMode {
  return typeof value === "string" && RENDERER_THEME_MODES.includes(value as RendererThemeMode);
}

function is_launcher_window_startup_size_mode(value: unknown): value is LauncherWindowStartupSizeMode {
  return typeof value === "string"
    && LAUNCHER_WINDOW_STARTUP_SIZE_MODES.includes(value as LauncherWindowStartupSizeMode);
}

function normalize_launcher_window_dimension(value: unknown, fallback: number, minimum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.round(value))
    : fallback;
}

function normalize_shortcuts(value: unknown): LauncherShortcutMap {
  const record = typeof value === "object" && value !== null ? (value as Partial<Record<LauncherShortcutAction, unknown>>) : {};

  return LAUNCHER_SHORTCUT_ACTIONS.reduce<LauncherShortcutMap>((shortcuts, action) => {
    shortcuts[action] = typeof record[action] === "string" ? record[action] : DEFAULT_SHORTCUTS[action];
    return shortcuts;
  }, { ...DEFAULT_SHORTCUTS });
}

function shortcut_key_label_from_code(code: string): string {
  if (code.startsWith("Key")) {
    return code.slice(3);
  }

  if (code.startsWith("Digit")) {
    return code.slice(5);
  }

  const codeLabelMap: Record<string, string> = {
    Backquote: "`",
    Backslash: "\\",
    BracketLeft: "[",
    BracketRight: "]",
    Comma: ",",
    Enter: "Return",
    Equal: "=",
    Minus: "-",
    Period: ".",
    Quote: "'",
    Semicolon: ";",
    Slash: "/",
    Space: "Space",
    Tab: "Tab",
  };

  return codeLabelMap[code] ?? code.replace(/^Numpad/, "Numpad ");
}

function shortcut_label_from_keyboard_event(event: KeyboardEvent): string | null {
  if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) {
    return null;
  }

  if (!event.metaKey && !event.ctrlKey && !event.altKey) {
    return null;
  }

  const parts: string[] = [];

  if (event.metaKey) {
    parts.push("Command");
  }

  if (event.ctrlKey) {
    parts.push("Ctrl");
  }

  if (event.altKey) {
    parts.push("Option");
  }

  if (event.shiftKey) {
    parts.push("Shift");
  }

  parts.push(shortcut_key_label_from_code(event.code));

  return parts.join(" + ");
}

function is_editable_event_target(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function create_data_root_child_path(dataRootPath: string, childName: string): string {
  const trimmedRoot = dataRootPath.trim().replace(/\/+$/, "") || DEFAULT_DATA_ROOT_PATH;

  return `${trimmedRoot}/${childName}`;
}

function derive_storage_paths_from_data_root(dataRootPath: string): {
  installPath: string;
  bottlePrefixPath: string;
  dxmtCachePath: string;
  gameInstallPath: string;
  jadeiteInstallPath: string;
} {
  return {
    installPath: create_data_root_child_path(dataRootPath, "Wine"),
    bottlePrefixPath: create_data_root_child_path(dataRootPath, "Bottles"),
    dxmtCachePath: create_data_root_child_path(dataRootPath, "DXMT"),
    gameInstallPath: create_data_root_child_path(dataRootPath, "Games"),
    jadeiteInstallPath: create_data_root_child_path(dataRootPath, "dependencies/jadeite"),
  };
}

function infer_data_root_from_storage_paths(
  installPath?: string,
  bottlePrefixPath?: string,
  dxmtCachePath?: string,
): string | undefined {
  const roots = [
    parent_path_if_named(installPath, "Wine"),
    parent_path_if_named(bottlePrefixPath, "Bottles"),
    parent_path_if_named(dxmtCachePath, "DXMT"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  if (roots.length === 0) {
    return undefined;
  }

  const normalizedRoots = [...new Set(roots.map(normalize_preference_path))];

  return normalizedRoots.length === 1 ? normalizedRoots[0] : undefined;
}

function parent_path_if_named(targetPath: string | undefined, expectedName: string): string | undefined {
  if (!targetPath) {
    return undefined;
  }

  const normalizedPath = targetPath.trim().replace(/\/+$/, "");
  const parts = normalizedPath.split("/");

  return parts[parts.length - 1] === expectedName ? parts.slice(0, -1).join("/") : undefined;
}

function apply_renderer_theme_mode(themeMode: RendererThemeMode) {
  const resolvedTheme = themeMode === "system"
    ? window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
    : themeMode;

  document.documentElement.dataset.themeMode = themeMode;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
}

function create_bottle_id(name: string): string {
  const slug = bottle_name_to_slug(name);
  return `${slug}-${Date.now().toString(36)}`;
}

function bottle_name_exists(name: string, bottles: Bottle[]): boolean {
  const nameKey = name.normalize("NFC").trim().toLocaleLowerCase();
  return bottles.some((bottle) =>
    bottle.name.normalize("NFC").trim().toLocaleLowerCase() === nameKey,
  );
}

function app_name_from_executable_path(executablePath: string): string {
  const normalizedPath = executablePath.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").pop() || "Program";
  return fileName.replace(/\.[^.]+$/, "") || fileName;
}

function executable_args_for_app(app: Bottle["apps"][number]): string[] | undefined {
  if (app.executableArgs && app.executableArgs.length > 0) {
    return app.executableArgs;
  }

  if (app.steamAppId) {
    return [STEAM_GAME_LAUNCH_ARGUMENT, app.steamAppId];
  }

  return undefined;
}

function log_entry_from_payload(entry: LauncherLogEntryPayload): LogEntry {
  return {
    id: entry.id,
    sessionId: entry.sessionId,
    timestamp: entry.timestamp,
    level: entry.level,
    category: entry.category,
    source: entry.source,
    bottleId: entry.bottleId,
    bottleName: entry.bottleName,
    message: entry.message,
  };
}

function log_session_from_payload(snapshot: LauncherLogSnapshotPayload): LogSession[] {
  return snapshot.sessions.map((session) => ({
    id: session.id,
    label: session.label,
    startedAt: session.startedAt,
    logFilePath: session.logFilePath,
    logFileName: session.logFileName,
    logDirectoryPath: session.logDirectoryPath,
    kind: session.kind,
    bottleId: session.bottleId,
    bottleName: session.bottleName,
    count: session.count,
    isRunning: session.isRunning,
  }));
}

function log_sources_from_payload(snapshot: LauncherLogSnapshotPayload): LogSourceOption[] {
  return snapshot.sources.map((source) => ({
    id: source.id,
    label: source.label,
    count: source.count,
  }));
}

function append_log_entry(entries: LogEntry[], entry: LauncherLogEntryPayload): LogEntry[] {
  if (entries.some((candidate) => candidate.id === entry.id)) {
    return entries;
  }

  return [...entries, log_entry_from_payload(entry)].slice(-3000);
}

function normalized_log_target(value?: string): string {
  return (value ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/^(?:wine|bottle)[\s:/_-]+/i, "")
    .replace(/\.log$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function log_session_app_target(session: LogSession): string {
  const fileName = session.logFileName?.replace(/\\/g, "/").split("/").pop();
  return normalized_log_target(fileName ?? session.label.split("/").pop());
}

function is_same_bottle_log_session(session: LogSession, entry: LauncherLogEntryPayload): boolean {
  if (session.kind !== "bottle" || !(entry.bottleId || entry.bottleName)) {
    return false;
  }

  if (session.bottleId && entry.bottleId) {
    return session.bottleId === entry.bottleId;
  }

  return Boolean(
    session.bottleName
      && entry.bottleName
      && normalized_log_target(session.bottleName) === normalized_log_target(entry.bottleName),
  );
}

function find_backed_log_session(
  sessions: LogSession[],
  entry: LauncherLogEntryPayload,
): LogSession | undefined {
  const exactBackedSession = sessions.find((session) =>
    session.id === entry.sessionId && Boolean(session.logFilePath),
  );

  if (exactBackedSession) {
    return exactBackedSession;
  }

  if (!(entry.bottleId || entry.bottleName)) {
    const appSessions = sessions.filter((session) =>
      session.kind === "app" && session.isRunning && Boolean(session.logFilePath),
    );
    return appSessions.length === 1 ? appSessions[0] : undefined;
  }

  const bottleSessions = sessions.filter((session) =>
    session.isRunning
      && Boolean(session.logFilePath)
      && is_same_bottle_log_session(session, entry),
  );
  const entryTarget = normalized_log_target(entry.source);
  const appMatches = bottleSessions.filter((session) =>
    log_session_app_target(session) === entryTarget,
  );

  if (appMatches.length === 1) {
    return appMatches[0];
  }

  return undefined;
}

function reconcile_live_log_entry(
  sessions: LogSession[],
  entry: LauncherLogEntryPayload,
): LauncherLogEntryPayload {
  const backedSession = find_backed_log_session(sessions, entry);

  if (!backedSession || backedSession.id === entry.sessionId) {
    return entry;
  }

  return {
    ...entry,
    sessionId: backedSession.id,
  };
}

function update_log_sessions(sessions: LogSession[], entry: LauncherLogEntryPayload): LogSession[] {
  const backedSession = find_backed_log_session(sessions, entry);
  const targetSessionId = backedSession?.id ?? entry.sessionId;

  if (!sessions.some((session) => session.id === targetSessionId)) {
    const isBottleSession = Boolean(entry.bottleId || entry.bottleName);
    const isRuntimeServicesSession = entry.category === "wine" && !isBottleSession;
    const label = isBottleSession && entry.bottleName
      ? `${entry.bottleName} / ${entry.source}`
      : isRuntimeServicesSession
        ? "Runtime services"
        : entry.sessionId;

    return [
      ...sessions,
      {
        id: targetSessionId,
        label,
        startedAt: entry.timestamp,
        logFilePath: entry.logFilePath,
        logFileName: entry.logFileName,
        logDirectoryPath: entry.logDirectoryPath,
        kind: isBottleSession ? "bottle" : "app",
        bottleId: entry.bottleId,
        bottleName: entry.bottleName,
        count: 1,
        isRunning: initial_running_state_for_live_log_entry(
          isBottleSession ? "bottle" : "app",
        ),
      },
    ];
  }

  return sessions
    .filter((session) =>
      session.id === targetSessionId
        || Boolean(session.logFilePath)
        || session.kind !== backedSession?.kind
        || (backedSession?.kind === "bottle" && !is_same_bottle_log_session(session, entry)),
    )
    .map((session) =>
    session.id === targetSessionId
      ? {
          ...session,
          count: (session.count ?? 0) + 1,
          isRunning: running_state_after_live_log_entry(
            session.kind,
            session.isRunning,
          ),
        }
      : session,
  );
}

function normalize_log_runtime_target(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s/\\:_-]+/g, "");
}

function log_session_matches_runtime_app(
  session: LogSession,
  bottleId: string | undefined,
  bottleName: string | undefined,
  appIds: Array<string | undefined>,
  appName: string | undefined,
): boolean {
  if (session.kind !== "bottle") return false;

  const sameBottle = bottleId && session.bottleId
    ? bottleId === session.bottleId
    : normalize_log_runtime_target(bottleName) === normalize_log_runtime_target(session.bottleName);
  if (!sameBottle) return false;

  const sessionTarget = normalize_log_runtime_target(log_session_app_target(session));
  const candidates = [...appIds, appName]
    .map((candidate) => normalize_log_runtime_target(candidate))
    .filter(Boolean);

  if (candidates.length === 0) return true;
  return candidates.some((candidate) =>
    sessionTarget === candidate
      || (candidate.length > 2 && sessionTarget.includes(candidate))
      || (sessionTarget.length > 2 && candidate.includes(sessionTarget)),
  );
}

function set_runtime_log_session_state(
  sessions: LogSession[],
  bottleId: string | undefined,
  bottleName: string | undefined,
  appIds: Array<string | undefined>,
  appName: string | undefined,
  isRunning: boolean,
  runtimeProcessId?: string,
): LogSession[] {
  const matchingSessions = sessions.filter((session) =>
    log_session_matches_runtime_app(session, bottleId, bottleName, appIds, appName),
  );
  const latestSession = matchingSessions.reduce<LogSession | undefined>((latest, session) => {
    if (!latest) return session;
    return new Date(session.startedAt).getTime() > new Date(latest.startedAt).getTime()
      ? session
      : latest;
  }, undefined);

  return sessions.map((session) => {
    if (!log_session_matches_runtime_app(session, bottleId, bottleName, appIds, appName)) {
      return session;
    }

    if (isRunning) {
      if (session.id === latestSession?.id) {
        return {
          ...session,
          isRunning: true,
          runtimeProcessId,
        };
      }

      // Clear stale name-matched history, but never overwrite a marker owned
      // by another process that is still active.
      if (!session.runtimeProcessId || session.runtimeProcessId === runtimeProcessId) {
        return {
          ...session,
          isRunning: false,
          runtimeProcessId: undefined,
        };
      }

      return session;
    }

    // Delayed exit events must only stop the log marker they originally
    // created. This keeps a newer run of the same app marked as active.
    if (runtimeProcessId && session.runtimeProcessId && session.runtimeProcessId !== runtimeProcessId) {
      return session;
    }

    if (runtimeProcessId && !session.runtimeProcessId && session.id !== latestSession?.id) {
      return session;
    }

    return {
      ...session,
      isRunning: false,
      runtimeProcessId: undefined,
    };
  });
}

function update_log_sources(sources: LogSourceOption[], entry: LauncherLogEntryPayload): LogSourceOption[] {
  const existingSource = sources.find((source) => source.id === entry.source);

  if (!existingSource) {
    return [...sources, { id: entry.source, label: entry.source, count: 1 }];
  }

  return sources.map((source) =>
    source.id === entry.source
      ? {
          ...source,
          count: (source.count ?? 0) + 1,
        }
      : source,
  );
}

function create_fallback_log_session(): LogSession {
  return {
    id: "current",
    label: "current",
    startedAt: new Date().toISOString(),
    kind: "app",
    count: 0,
    isRunning: true,
  };
}

function strip_transient_launcher_tasks(bottle: Bottle): Bottle {
  const apps = bottle.apps.map((app) => {
    if (!app.processId && !app.isLaunching) {
      return app;
    }

    const { processId: _processId, isLaunching: _isLaunching, ...rest } = app;
    return rest;
  });

  if (!bottle.launcherTasks) {
    return {
      ...bottle,
      apps,
    };
  }

  const launcherTasks = Object.fromEntries(
    Object.entries(bottle.launcherTasks).filter(([, task]) => task?.stage === "ready" || task?.stage === "downloaded"),
  ) as Bottle["launcherTasks"];

  return {
    ...bottle,
    apps,
    launcherTasks: launcherTasks && Object.keys(launcherTasks).length > 0 ? launcherTasks : undefined,
  };
}

function preference_snapshots_equal(left: PreferenceDraftSnapshot, right: PreferenceDraftSnapshot): boolean {
  return (
    left.locale === right.locale &&
    left.accentColor === right.accentColor &&
    left.themeMode === right.themeMode &&
    left.appLoggingLevel === right.appLoggingLevel &&
    left.debugFlagMode === right.debugFlagMode &&
    left.loggingLevel === right.loggingLevel &&
    left.wineDebugArgs.trim() === right.wineDebugArgs.trim() &&
    left.autoUpdateEnabled === right.autoUpdateEnabled &&
    left.closeToTray === right.closeToTray &&
    left.windowStartupSizeMode === right.windowStartupSizeMode &&
    left.windowStartupCustomWidth === right.windowStartupCustomWidth &&
    left.windowStartupCustomHeight === right.windowStartupCustomHeight &&
    preference_storage_paths_equal(left, right) &&
    LAUNCHER_SHORTCUT_ACTIONS.every((action) => left.shortcuts[action] === right.shortcuts[action])
  );
}

const App: React.FC = () => {
  const { t } = useTranslation();
  const [activeView, setActiveView] = useState<RendererViewKey>("dashboard");
  const [locale, setLocale] = useState<SupportedLocale>(() => resolve_initial_locale());
  const [accentColor, setAccentColor] = useState<AccentColor>(() => resolve_initial_accent_color());
  const [appliedAccentColor, setAppliedAccentColor] = useState<AccentColor>(() => resolve_initial_accent_color());
  const [themeMode, setThemeMode] = useState<RendererThemeMode>("system");
  const [appLoggingLevel, setAppLoggingLevel] = useState<LauncherLogLevel>("info");
  const [debugFlagMode, setDebugFlagMode] = useState<DebugFlagMode>("preset");
  const [loggingLevel, setLoggingLevel] = useState<LauncherLogLevel>("off");
  const [dataRootPath, setDataRootPath] = useState(DEFAULT_DATA_ROOT_PATH);
  const [installPath, setInstallPath] = useState(DEFAULT_WINE_INSTALL_PATH);
  const [bottlePrefixPath, setBottlePrefixPath] = useState(DEFAULT_BOTTLE_PREFIX_PATH);
  const [dxmtCachePath, setDxmtCachePath] = useState(DEFAULT_DXMT_CACHE_PATH);
  const [gameInstallPath, setGameInstallPath] = useState(DEFAULT_GAME_INSTALL_PATH);
  const [wineDebugArgs, setWineDebugArgs] = useState("");
  const [shortcuts, setShortcuts] = useState<LauncherShortcutMap>(DEFAULT_SHORTCUTS);
  const [appliedShortcuts, setAppliedShortcuts] = useState<LauncherShortcutMap>(DEFAULT_SHORTCUTS);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);
  const [closeToTray, setCloseToTray] = useState(false);
  const [windowStartupSizeMode, setWindowStartupSizeMode] = useState<LauncherWindowStartupSizeMode>("default");
  const [windowStartupCustomWidth, setWindowStartupCustomWidth] = useState(LAUNCHER_WINDOW_DEFAULT_SIZE.width);
  const [windowStartupCustomHeight, setWindowStartupCustomHeight] = useState(LAUNCHER_WINDOW_DEFAULT_SIZE.height);
  const [appUpdateStatus, setAppUpdateStatus] = useState<AppUpdateStatusPayload>();
  const [appUpdateInstallProgress, setAppUpdateInstallProgress] = useState<AppUpdateInstallProgressPayload>();
  const [deletingBottleModal, setDeletingBottleModal] = useState<{
    name: string;
    progress: number;
    message: string;
  } | null>(null);
  const [unsupportedWineModal, setUnsupportedWineModal] = useState<{
    appName: string;
    wineVersionId: string;
    details: string;
  } | null>(null);
  const [pendingLauncherExecutable, setPendingLauncherExecutable] =
    useState<PendingLauncherExecutableConfirmation | null>(null);
  const [isPreferenceLoaded, setIsPreferenceLoaded] = useState(false);
  const [savedPreferenceSnapshot, setSavedPreferenceSnapshot] = useState<PreferenceDraftSnapshot>(() => ({
    locale: resolve_initial_locale(),
    accentColor: resolve_initial_accent_color(),
    themeMode: "system",
    appLoggingLevel: "info",
    debugFlagMode: "preset",
    loggingLevel: "off",
    wineDebugArgs: "",
    shortcuts: DEFAULT_SHORTCUTS,
    autoUpdateEnabled: true,
    closeToTray: false,
    windowStartupSizeMode: "default",
    windowStartupCustomWidth: LAUNCHER_WINDOW_DEFAULT_SIZE.width,
    windowStartupCustomHeight: LAUNCHER_WINDOW_DEFAULT_SIZE.height,
    dataRootPath: DEFAULT_DATA_ROOT_PATH,
    installPath: DEFAULT_WINE_INSTALL_PATH,
    bottlePrefixPath: DEFAULT_BOTTLE_PREFIX_PATH,
    dxmtCachePath: DEFAULT_DXMT_CACHE_PATH,
    gameInstallPath: DEFAULT_GAME_INSTALL_PATH,
  }));
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [logSessions, setLogSessions] = useState<LogSession[]>([]);
  const [logSources, setLogSources] = useState<LogSourceOption[]>([]);
  const [isDeveloperOnAir, setIsDeveloperOnAir] = useState(false);
  const executionStateRef = useRef<BottleExecutionStatePayload>({
    isRunning: false,
    revision: 0,
    executions: [],
  });
  const bottlesRef = useRef<Bottle[]>([]);
  bottlesRef.current = bottles;
  const isMac = window.BTIH_ENV?.platform === "darwin";
  const {
    wineVersions,
    dxmtVersions,
    jadeiteVersions,
    selectedWineVersionId,
    selectedDxmtVersionId,
    selectedJadeiteVersionId,
    isLoadingWineVersions,
    isLoadingDxmtVersions,
    isLoadingJadeiteVersions,
    runtimeInstallFailure,
    loadWineVersions,
    loadDxmtVersions,
    loadJadeiteVersions,
    installWineVersion,
    installDxmtVersion,
    installJadeiteVersion,
    deleteWineVersion,
    deleteDxmtVersion,
    deleteJadeiteVersion,
    selectWineVersion,
    selectDxmtVersion,
    selectJadeiteVersion,
    setInstallPath: setStoreInstallPath,
    setDxmtCachePath: setStoreDxmtCachePath,
    setJadeiteInstallPath: setStoreJadeiteInstallPath,
    clearWineRuntimeMetadata,
    clearDxmtRuntimeMetadata,
    clearJadeiteRuntimeMetadata,
    clearRuntimeInstallFailure,
    subscribeWineStatus,
  } = useSystemStore();
  const currentPreferenceSnapshot = useMemo<PreferenceDraftSnapshot>(() => ({
    locale,
    accentColor,
    themeMode,
    appLoggingLevel,
    debugFlagMode,
    loggingLevel,
    wineDebugArgs,
    shortcuts,
    autoUpdateEnabled,
    closeToTray,
    windowStartupSizeMode,
    windowStartupCustomWidth,
    windowStartupCustomHeight,
    dataRootPath,
    installPath,
    bottlePrefixPath,
    dxmtCachePath,
    gameInstallPath,
  }), [
    accentColor,
    appLoggingLevel,
    autoUpdateEnabled,
    bottlePrefixPath,
    closeToTray,
    windowStartupCustomHeight,
    windowStartupCustomWidth,
    windowStartupSizeMode,
    dataRootPath,
    debugFlagMode,
    dxmtCachePath,
    gameInstallPath,
    installPath,
    locale,
    loggingLevel,
    shortcuts,
    themeMode,
    wineDebugArgs,
  ]);
  const hasUnsavedPreferenceChanges = isPreferenceLoaded && !preference_snapshots_equal(currentPreferenceSnapshot, savedPreferenceSnapshot);

  const bottlePersistQueueRef = useRef<Promise<void>>(Promise.resolve());

  function persist_bottles(nextBottles: Bottle[]): Promise<BottleListPayload | undefined> {
    const payload = {
      bottles: nextBottles.map(strip_transient_launcher_tasks),
    };
    const saveRequest = bottlePersistQueueRef.current
      .catch(() => undefined)
      .then(() => window.BTIH_API?.invoke(
        IPC_CHANNELS.BOTTLE.SAVE_LIST.channelName,
        payload,
      ) as Promise<BottleListPayload | undefined>);

    bottlePersistQueueRef.current = saveRequest.then(
      () => undefined,
      (error) => {
        console.error("Failed to persist bottle metadata:", error);
      },
    );

    return saveRequest;
  }

  function update_bottles(updater: (currentBottles: Bottle[]) => Bottle[]): Promise<BottleListPayload | undefined> {
    const nextBottles = updater(bottlesRef.current);

    bottlesRef.current = nextBottles;
    setBottles(nextBottles);
    return persist_bottles(nextBottles);
  }

  function update_data_root_draft(nextDataRootPath: string) {
    const nextStoragePaths = derive_storage_paths_from_data_root(nextDataRootPath);
    const currentDefaultBottlePrefixPath = derive_storage_paths_from_data_root(dataRootPath).bottlePrefixPath;
    const currentDefaultGameInstallPath = derive_storage_paths_from_data_root(dataRootPath).gameInstallPath;
    const usesCustomBottlePrefixPath = normalize_preference_path(bottlePrefixPath) !== normalize_preference_path(currentDefaultBottlePrefixPath);
    const usesCustomGameInstallPath = normalize_preference_path(gameInstallPath) !== normalize_preference_path(currentDefaultGameInstallPath);

    setDataRootPath(nextDataRootPath);
    setInstallPath(nextStoragePaths.installPath);
    setBottlePrefixPath(usesCustomBottlePrefixPath ? bottlePrefixPath : nextStoragePaths.bottlePrefixPath);
    setDxmtCachePath(nextStoragePaths.dxmtCachePath);
    setGameInstallPath(usesCustomGameInstallPath ? gameInstallPath : nextStoragePaths.gameInstallPath);
  }

  function restore_preference_draft(snapshot: PreferenceDraftSnapshot) {
    setLocale(snapshot.locale);
    setAccentColor(snapshot.accentColor);
    setThemeMode(snapshot.themeMode);
    setAppLoggingLevel(snapshot.appLoggingLevel);
    setDebugFlagMode(snapshot.debugFlagMode);
    setLoggingLevel(snapshot.loggingLevel);
    setWineDebugArgs(snapshot.wineDebugArgs);
    setShortcuts(snapshot.shortcuts);
    setAutoUpdateEnabled(snapshot.autoUpdateEnabled);
    setCloseToTray(snapshot.closeToTray);
    setWindowStartupSizeMode(snapshot.windowStartupSizeMode);
    setWindowStartupCustomWidth(snapshot.windowStartupCustomWidth);
    setWindowStartupCustomHeight(snapshot.windowStartupCustomHeight);
    setDataRootPath(snapshot.dataRootPath);
    setInstallPath(snapshot.installPath);
    setStoreInstallPath(snapshot.installPath);
    setBottlePrefixPath(snapshot.bottlePrefixPath);
    setDxmtCachePath(snapshot.dxmtCachePath);
    setGameInstallPath(snapshot.gameInstallPath);
    setStoreDxmtCachePath(snapshot.dxmtCachePath);
    setStoreJadeiteInstallPath(derive_storage_paths_from_data_root(snapshot.dataRootPath).jadeiteInstallPath);
  }

  useEffect(() => {
    void loadWineVersions();
    void loadDxmtVersions();
    void loadJadeiteVersions();
    const unsubscribe = subscribeWineStatus();

    return () => {
      unsubscribe();
    };
  }, [loadDxmtVersions, loadJadeiteVersions, loadWineVersions, subscribeWineStatus]);

  const logSessionsRef = useRef(logSessions);

  useEffect(() => {
    logSessionsRef.current = logSessions;
  }, [logSessions]);

  useEffect(() => {
    let isMounted = true;

    async function preload_update_status() {
      try {
        const status = await window.BTIH_API?.invoke(
          IPC_CHANNELS.APP.GET_UPDATE_STATUS.channelName,
          undefined as never,
        ) as AppUpdateStatusPayload | undefined;

        if (isMounted && status) {
          setAppUpdateStatus(status);
        }
      } catch {
        // Startup update checks continue through UpdateManager status events.
      }
    }

    async function preload_developer_live_status() {
      try {
        const status = await window.BTIH_API?.invoke(
          IPC_CHANNELS.YOUTUBE.GET_LIVE_STATUS.channelName,
          { handle: DEVELOPER_YOUTUBE_HANDLE },
        ) as YouTubeLiveStatusPayload | undefined;

        if (isMounted) {
          setIsDeveloperOnAir(status?.isLive ?? false);
        }
      } catch {
        if (isMounted) {
          setIsDeveloperOnAir(false);
        }
      }
    }

    void preload_update_status();
    void preload_developer_live_status();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (activeView !== "preferences") {
      return () => {
        isMounted = false;
      };
    }

    async function refresh_developer_live_status() {
      try {
        const status = (await window.BTIH_API?.invoke(
          IPC_CHANNELS.YOUTUBE.GET_LIVE_STATUS.channelName,
          { handle: DEVELOPER_YOUTUBE_HANDLE },
        )) as YouTubeLiveStatusPayload | undefined;

        if (isMounted) {
          setIsDeveloperOnAir(status?.isLive ?? false);
        }
      } catch {
        if (isMounted) {
          setIsDeveloperOnAir(false);
        }
      }
    }

    async function refresh_update_status() {
      try {
        const status = await window.BTIH_API?.invoke(
          IPC_CHANNELS.APP.GET_UPDATE_STATUS.channelName,
          undefined as never,
        ) as AppUpdateStatusPayload | undefined;

        if (isMounted && status) {
          setAppUpdateStatus(status);
        }
      } catch {
        // Keep the most recent startup/event status visible on transient errors.
      }
    }

    void refresh_developer_live_status();
    void refresh_update_status();
    const liveIntervalId = window.setInterval(
      refresh_developer_live_status,
      YOUTUBE_LIVE_REFRESH_INTERVAL_MS,
    );

    return () => {
      isMounted = false;
      window.clearInterval(liveIntervalId);
    };
  }, [activeView]);

  useEffect(() => {
    if (!isPreferenceLoaded || !savedPreferenceSnapshot.autoUpdateEnabled) {
      return undefined;
    }

    const updateIntervalId = window.setInterval(() => {
      window.BTIH_API?.send(IPC_CHANNELS.APP.UPDATE.channelName, undefined as never);
    }, UPDATE_STATUS_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(updateIntervalId);
  }, [isPreferenceLoaded, savedPreferenceSnapshot.autoUpdateEnabled]);

  useEffect(() => {
    const unsubscribe = window.BTIH_API?.on(
      IPC_CHANNELS.BOTTLE.EXECUTION_STATE_UPDATE.channelName,
      (_event, snapshot: BottleExecutionStatePayload) => {
        if (snapshot.revision < executionStateRef.current.revision) {
          return;
        }

        executionStateRef.current = snapshot;
        setBottles((currentBottles) =>
          apply_execution_state_to_bottles(currentBottles, snapshot),
        );
      },
    );

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function load_bottle_metadata() {
      try {
        const [payload, executionState] = await Promise.all([
          window.BTIH_API?.invoke(
            IPC_CHANNELS.BOTTLE.GET_LIST.channelName,
            undefined as never,
          ) as Promise<BottleListPayload | undefined>,
          window.BTIH_API?.invoke(
            IPC_CHANNELS.BOTTLE.GET_EXECUTION_STATE.channelName,
            {},
          ) as Promise<BottleExecutionStatePayload | undefined>,
        ]);

        if (isMounted && payload?.bottles) {
          if (
            executionState
            && executionState.revision >= executionStateRef.current.revision
          ) {
            executionStateRef.current = executionState;
          }

          setBottles(apply_execution_state_to_bottles(
            payload.bottles.map(strip_transient_launcher_tasks),
            executionStateRef.current,
          ));
        }
      } catch (error) {
        console.error("Failed to load bottle metadata:", error);
      }
    }

    void load_bottle_metadata();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.BTIH_API?.on(
      IPC_CHANNELS.BOTTLE.STATUS_UPDATE.channelName,
      (_event, payload: BottleTaskStatusPayload) => {
        if (!payload.launcher && payload.stage === "ready") {
          window.setTimeout(() => {
            update_bottles((currentBottles) =>
              currentBottles.map((bottle) =>
                bottle.id === payload.bottleId && bottle.setupTask?.stage === "ready"
                  ? {
                      ...bottle,
                      setupTask: undefined,
                    }
                  : bottle,
              ),
            );
          }, 1400);
        }

        update_bottles((currentBottles) =>
          currentBottles.map((bottle) => {
            if (bottle.id !== payload.bottleId) {
              return bottle;
            }

            if (payload.launcher) {
              const nextLauncherTasks = { ...bottle.launcherTasks };

              nextLauncherTasks[payload.launcher] = {
                stage: payload.stage,
                progress: payload.progress,
                message: payload.message,
              };

              return {
                ...bottle,
                launcherTasks: Object.keys(nextLauncherTasks).length > 0 ? nextLauncherTasks : undefined,
              };
            }

            return {
              ...bottle,
              status: payload.stage === "ready" ? "ready" : payload.stage === "error" ? "needs-setup" : "updating",
              setupTask: {
                stage: payload.stage,
                progress: payload.progress,
                message: payload.message,
              },
            };
          }),
        );
      },
    );

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const unsubscribe = window.BTIH_API?.on(
      IPC_CHANNELS.BOTTLE.EXECUTION_AVAILABILITY_UPDATE.channelName,
      (_event, payload: BottleExecutionAvailabilityPayload) => {
        if (payload.status !== "unavailable") {
          return;
        }

        const message = payload.message
          ?? (
            payload.issues.map((issue) => issue.message).join("\n")
            || "The selected execution Strategy is unavailable."
          );

        if (
          payload.providerId.startsWith("hoyo")
          && payload.issues.some((issue) =>
            issue.code === "wine-manifest-missing"
            || issue.code === "wine-manifest-group-missing",
          )
        ) {
          setUnsupportedWineModal({
            appName: bottlesRef.current
              .find((bottle) => bottle.id === payload.bottleId)
              ?.apps.find((app) => app.id === payload.appId)?.name
              ?? payload.appId
              ?? payload.providerId,
            wineVersionId: payload.wineVersionId,
            details: message,
          });
        }

      },
    );

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const unsubscribe = window.BTIH_API?.on(
      IPC_CHANNELS.BOTTLE.PREFIX_SESSION_UPDATE.channelName,
      (_event, payload: BottlePrefixSessionPayload) => {
        setLogSessions((currentSessions) => {
          const nextSessions = set_runtime_log_session_state(
            currentSessions,
            payload.bottleId,
            payload.bottleName,
            [payload.appId, ...(payload.appIds ?? [])],
            payload.appName,
            payload.isRunning,
            payload.processId,
          );
          logSessionsRef.current = nextSessions;
          return nextSessions;
        });

        const currentBottles = bottlesRef.current;
        const matchingBottle = currentBottles.find((bottle) => bottle.id === payload.bottleId);
        const matchingApp = matchingBottle?.apps.find((app) => app.id === payload.appId);
        const knownAppIds = new Set(matchingBottle?.apps.map((app) => app.id) ?? []);
        const hasUnknownSessionApp = [...app_ids_from_prefix_session(payload)].some((appId) =>
          !appId.startsWith("installer:") && !knownAppIds.has(appId),
        );
        const shouldReloadBottles = payload.executionMode === "installer"
          ? !payload.isRunning
          : Boolean(
              payload.isRunning &&
              payload.appId &&
              matchingBottle &&
              (!matchingApp || !matchingApp.iconSrc || hasUnknownSessionApp),
            );

        if (shouldReloadBottles) {
          void (async () => {
            const bottlePayload = (await window.BTIH_API?.invoke(
              IPC_CHANNELS.BOTTLE.GET_LIST.channelName,
              undefined as never,
            )) as BottleListPayload | undefined;

            if (bottlePayload?.bottles) {
              setBottles(apply_execution_state_to_bottles(
                bottlePayload.bottles.map(strip_transient_launcher_tasks),
                executionStateRef.current,
              ));
            }
          })().catch((error) => {
            console.error("Failed to reload bottle metadata after prefix session update:", error);
          });
        }
      },
    );

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const unsubscribe = window.BTIH_API?.on(
      IPC_CHANNELS.BOTTLE.PROCESS_EXIT.channelName,
      (_event, payload: BottleProcessExitPayload) => {
        const exitedApps = bottlesRef.current.flatMap((bottle) =>
          bottle.apps
            .filter((app) => app.processId === payload.processId)
            .map((app) => ({ bottle, app })),
        );
        if (exitedApps.length > 0) {
          setLogSessions((currentSessions) => {
            const nextSessions = exitedApps.reduce(
              (sessions, { bottle, app }) => set_runtime_log_session_state(
                sessions,
                bottle.id,
                bottle.name,
                [app.id],
                app.name,
                false,
                payload.processId,
              ),
              currentSessions,
            );
            logSessionsRef.current = nextSessions;
            return nextSessions;
          });
        }

      },
    );

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function load_log_snapshot() {
      try {
        const snapshot = (await window.BTIH_API?.invoke(
          IPC_CHANNELS.APP.GET_LOG_SNAPSHOT.channelName,
          undefined as never,
        )) as LauncherLogSnapshotPayload | undefined;

        if (!isMounted) {
          return;
        }

        if (!snapshot) {
          setLogSessions([create_fallback_log_session()]);
          return;
        }

        const nextLogSessions = snapshot.sessions.length > 0
          ? log_session_from_payload(snapshot)
          : [create_fallback_log_session()];
        logSessionsRef.current = nextLogSessions;
        setLogEntries(snapshot.entries.map(log_entry_from_payload));
        setLogSessions(nextLogSessions);
        setLogSources(log_sources_from_payload(snapshot));
      } catch {
        if (isMounted) {
          setLogSessions([create_fallback_log_session()]);
        }
      }
    }

    void load_log_snapshot();

    const unsubscribe = window.BTIH_API?.on(
      IPC_CHANNELS.APP.LOG_UPDATE.channelName,
      (_event, entry: LauncherLogEntryPayload) => {
        const reconciledEntry = reconcile_live_log_entry(logSessionsRef.current, entry);
        setLogEntries((currentEntries) => append_log_entry(currentEntries, reconciledEntry));
        setLogSessions((currentSessions) => {
          const nextLogSessions = update_log_sessions(currentSessions, reconciledEntry);
          logSessionsRef.current = nextLogSessions;
          return nextLogSessions;
        });
        setLogSources((currentSources) => update_log_sources(currentSources, reconciledEntry));
      },
    );

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    return window.BTIH_API?.on(IPC_CHANNELS.APP.UPDATE_STATUS.channelName, (_event, payload: AppUpdateStatusPayload) => {
      if (payload.status === "error") {
        setAppUpdateInstallProgress(undefined);
      }

      setAppUpdateStatus(payload);
    });
  }, []);

  useEffect(() => {
    return window.BTIH_API?.on(
      IPC_CHANNELS.APP.UPDATE_INSTALL_PROGRESS.channelName,
      (_event, payload: AppUpdateInstallProgressPayload) => {
        setAppUpdateInstallProgress(payload);
      },
    );
  }, []);

  const selectedWineVersion = useMemo(
    () => wineVersions.find((version) => version.id === selectedWineVersionId),
    [selectedWineVersionId, wineVersions],
  );

  const handle_locale_change = (nextLocale: SupportedLocale) => {
    setLocale(nextLocale);
  };

  function handle_view_change(nextView: RendererViewKey) {
    if (nextView === activeView) {
      return;
    }

    if (activeView === "preferences" && nextView !== "preferences" && hasUnsavedPreferenceChanges) {
      const shouldDiscard = window.confirm("저장하지 않은 설정 변경이 있습니다. 변경 사항을 버리고 이동할까요?");

      if (!shouldDiscard) {
        return;
      }

      restore_preference_draft(savedPreferenceSnapshot);
    }

    setActiveView(nextView);
  }

  useEffect(() => {
    let isMounted = true;

    async function load_preference() {
      const api = window.BTIH_API;
      if (!api) {
        setIsPreferenceLoaded(true);
        return;
      }

      try {
        const preference = (await api.invoke(
          IPC_CHANNELS.APP.GET_PREFERENCE.channelName,
          undefined as never,
        )) as LauncherPreferencePayload | undefined;

        if (!isMounted) {
          return;
        }

        if (!preference) {
          setIsPreferenceLoaded(true);
          return;
        }

        const nextLocale = is_supported_locale(preference.language) ? preference.language : resolve_initial_locale();
        const nextAccentColor = is_accent_color(preference.accentColor) ? preference.accentColor : resolve_initial_accent_color();
        setLocale(nextLocale);
        void change_renderer_locale(nextLocale);
        setAccentColor(nextAccentColor);
        setAppliedAccentColor(nextAccentColor);

        const nextDataRootPath =
          typeof preference.dataRootPath === "string" && preference.dataRootPath.length > 0
            ? preference.dataRootPath
            : infer_data_root_from_storage_paths(
              preference.wineInstallPath,
              preference.bottlePrefixPath,
              preference.dxmtCachePath,
            ) ?? DEFAULT_DATA_ROOT_PATH;
        const nextStoragePaths = derive_storage_paths_from_data_root(nextDataRootPath);
        const nextInstallPath = nextStoragePaths.installPath;
        const nextBottlePrefixPath = nextStoragePaths.bottlePrefixPath;
        const nextDxmtCachePath = nextStoragePaths.dxmtCachePath;
        const nextGameInstallPath = typeof preference.gameInstallPath === "string" && preference.gameInstallPath.trim().length > 0
          ? preference.gameInstallPath
          : nextStoragePaths.gameInstallPath;
        setDataRootPath(nextDataRootPath);
        setInstallPath(nextInstallPath);
        setStoreInstallPath(nextInstallPath);
        setBottlePrefixPath(nextBottlePrefixPath);
        setDxmtCachePath(nextDxmtCachePath);
        setGameInstallPath(nextGameInstallPath);
        setStoreDxmtCachePath(nextDxmtCachePath);
        setStoreJadeiteInstallPath(nextStoragePaths.jadeiteInstallPath);
        const nextThemeMode = is_renderer_theme_mode(preference.themeMode) ? preference.themeMode : "system";
        setThemeMode(nextThemeMode);
        apply_renderer_theme_mode(nextThemeMode);
        setAppLoggingLevel(is_launcher_log_level(preference.appLoggingLevel) ? preference.appLoggingLevel : "info");
        setDebugFlagMode(is_debug_flag_mode(preference.debugFlagMode) ? preference.debugFlagMode : "preset");
        setLoggingLevel(is_launcher_log_level(preference.loggingLevel) ? preference.loggingLevel : "off");
        setWineDebugArgs(typeof preference.wineDebugArgs === "string" ? preference.wineDebugArgs : "");
        const nextAutoCheckUpdates = typeof preference.autoCheckUpdates === "boolean" ? preference.autoCheckUpdates : true;
        setAutoUpdateEnabled(nextAutoCheckUpdates);
        const nextCloseToTray = typeof preference.closeToTray === "boolean" ? preference.closeToTray : false;
        setCloseToTray(nextCloseToTray);
        const nextWindowStartupSizeMode = is_launcher_window_startup_size_mode(preference.windowStartupSizeMode)
          ? preference.windowStartupSizeMode
          : "default";
        const nextWindowStartupCustomWidth = normalize_launcher_window_dimension(
          preference.windowStartupCustomWidth,
          LAUNCHER_WINDOW_DEFAULT_SIZE.width,
          LAUNCHER_WINDOW_MIN_SIZE.width,
        );
        const nextWindowStartupCustomHeight = normalize_launcher_window_dimension(
          preference.windowStartupCustomHeight,
          LAUNCHER_WINDOW_DEFAULT_SIZE.height,
          LAUNCHER_WINDOW_MIN_SIZE.height,
        );
        setWindowStartupSizeMode(nextWindowStartupSizeMode);
        setWindowStartupCustomWidth(nextWindowStartupCustomWidth);
        setWindowStartupCustomHeight(nextWindowStartupCustomHeight);
        const nextShortcuts = normalize_shortcuts(preference.shortcuts);
        setShortcuts(nextShortcuts);
        setAppliedShortcuts(nextShortcuts);
        setSavedPreferenceSnapshot({
          locale: nextLocale,
          accentColor: nextAccentColor,
          dataRootPath: nextDataRootPath,
          installPath: nextInstallPath,
          bottlePrefixPath: nextBottlePrefixPath,
          dxmtCachePath: nextDxmtCachePath,
          gameInstallPath: nextGameInstallPath,
          themeMode: nextThemeMode,
          appLoggingLevel: is_launcher_log_level(preference.appLoggingLevel) ? preference.appLoggingLevel : "info",
          debugFlagMode: is_debug_flag_mode(preference.debugFlagMode) ? preference.debugFlagMode : "preset",
          loggingLevel: is_launcher_log_level(preference.loggingLevel) ? preference.loggingLevel : "off",
          wineDebugArgs: typeof preference.wineDebugArgs === "string" ? preference.wineDebugArgs : "",
          shortcuts: nextShortcuts,
          autoUpdateEnabled: nextAutoCheckUpdates,
          closeToTray: nextCloseToTray,
          windowStartupSizeMode: nextWindowStartupSizeMode,
          windowStartupCustomWidth: nextWindowStartupCustomWidth,
          windowStartupCustomHeight: nextWindowStartupCustomHeight,
        });
        setIsPreferenceLoaded(true);
      } catch {
        if (isMounted) {
          setDataRootPath(DEFAULT_DATA_ROOT_PATH);
          setInstallPath(DEFAULT_WINE_INSTALL_PATH);
          setStoreInstallPath(DEFAULT_WINE_INSTALL_PATH);
          setBottlePrefixPath(DEFAULT_BOTTLE_PREFIX_PATH);
          setDxmtCachePath(DEFAULT_DXMT_CACHE_PATH);
          setGameInstallPath(DEFAULT_GAME_INSTALL_PATH);
          setStoreDxmtCachePath(DEFAULT_DXMT_CACHE_PATH);
          setStoreJadeiteInstallPath(DEFAULT_JADEITE_INSTALL_PATH);
          setThemeMode("system");
          setAppLoggingLevel("off");
          setDebugFlagMode("preset");
          setLoggingLevel("off");
          setWineDebugArgs("");
          setShortcuts(DEFAULT_SHORTCUTS);
          setAppliedShortcuts(DEFAULT_SHORTCUTS);
          setAutoUpdateEnabled(true);
          setWindowStartupSizeMode("default");
          setWindowStartupCustomWidth(LAUNCHER_WINDOW_DEFAULT_SIZE.width);
          setWindowStartupCustomHeight(LAUNCHER_WINDOW_DEFAULT_SIZE.height);
          setSavedPreferenceSnapshot({
            locale: resolve_initial_locale(),
            accentColor: resolve_initial_accent_color(),
            themeMode: "system",
            appLoggingLevel: "info",
            debugFlagMode: "preset",
            loggingLevel: "off",
            wineDebugArgs: "",
            shortcuts: DEFAULT_SHORTCUTS,
            autoUpdateEnabled: true,
            closeToTray: false,
            windowStartupSizeMode: "default",
            windowStartupCustomWidth: LAUNCHER_WINDOW_DEFAULT_SIZE.width,
            windowStartupCustomHeight: LAUNCHER_WINDOW_DEFAULT_SIZE.height,
            dataRootPath: DEFAULT_DATA_ROOT_PATH,
            installPath: DEFAULT_WINE_INSTALL_PATH,
            bottlePrefixPath: DEFAULT_BOTTLE_PREFIX_PATH,
            dxmtCachePath: DEFAULT_DXMT_CACHE_PATH,
            gameInstallPath: DEFAULT_GAME_INSTALL_PATH,
          });
          setIsPreferenceLoaded(true);
        }
      }
    }

    void load_preference();

    return () => {
      isMounted = false;
    };
  }, [setLocale, setStoreDxmtCachePath, setStoreInstallPath, setStoreJadeiteInstallPath]);

  useEffect(() => {
    apply_renderer_accent_color(appliedAccentColor);
  }, [appliedAccentColor]);

  useEffect(() => {
    const handle_key_down = (event: KeyboardEvent) => {
      if (is_editable_event_target(event.target)) {
        return;
      }

      const shortcut = shortcut_label_from_keyboard_event(event);

      if (!shortcut) {
        return;
      }

      if (shortcut === appliedShortcuts.logs) {
        event.preventDefault();
        handle_view_change("logs");
        return;
      }

      if (shortcut === appliedShortcuts.preferences) {
        event.preventDefault();
        handle_view_change("preferences");
      }
    };

    window.addEventListener("keydown", handle_key_down);
    return () => window.removeEventListener("keydown", handle_key_down);
  }, [activeView, appliedShortcuts, hasUnsavedPreferenceChanges, savedPreferenceSnapshot]);

  const handle_save_preference = () => {
    void window.BTIH_API?.invoke(IPC_CHANNELS.APP.UPDATE_PREFERENCE.channelName, {
      language: locale,
      accentColor,
      dataRootPath,
      wineInstallPath: installPath,
      bottlePrefixPath,
      dxmtCachePath,
      gameInstallPath,
      themeMode,
      appLoggingLevel,
      debugFlagMode,
      loggingLevel,
      wineDebugArgs,
      shortcuts,
      autoCheckUpdates: autoUpdateEnabled,
      closeToTray,
      windowStartupSizeMode,
      windowStartupCustomWidth,
      windowStartupCustomHeight,
    }).then((result) => {
      const savedPreference = result as LauncherPreferencePayload | undefined;
      if (!savedPreference) {
        return;
      }

      // Main can normalize storage paths (notably for isolated update-test
      // builds). Reflect the value that was actually persisted instead of
      // treating the renderer draft as the saved source of truth.
      const savedDataRootPath = savedPreference.dataRootPath || dataRootPath;
      const savedStoragePaths = derive_storage_paths_from_data_root(savedDataRootPath);
      const savedSnapshot: PreferenceDraftSnapshot = {
        ...currentPreferenceSnapshot,
        dataRootPath: savedDataRootPath,
        installPath: savedPreference.wineInstallPath || savedStoragePaths.installPath,
        bottlePrefixPath: savedPreference.bottlePrefixPath || savedStoragePaths.bottlePrefixPath,
        dxmtCachePath: savedPreference.dxmtCachePath || savedStoragePaths.dxmtCachePath,
        gameInstallPath: savedPreference.gameInstallPath || savedStoragePaths.gameInstallPath,
      };

      restore_preference_draft(savedSnapshot);
      setSavedPreferenceSnapshot(savedSnapshot);
      setAppliedShortcuts(savedSnapshot.shortcuts);
      setAppliedAccentColor(savedSnapshot.accentColor);
      void change_renderer_locale(savedSnapshot.locale);
      apply_renderer_theme_mode(savedSnapshot.themeMode);
    });
  };

  const handle_check_for_updates = () => {
    window.BTIH_API?.send(IPC_CHANNELS.APP.UPDATE.channelName, undefined as never);
  };

  const handle_install_update = () => {
    window.BTIH_API?.send(IPC_CHANNELS.APP.INSTALL_UPDATE.channelName, undefined as never);
  };

  const handle_shortcut_change = (action: LauncherShortcutAction, shortcut: string) => {
    setShortcuts((currentShortcuts) => ({
      ...currentShortcuts,
      [action]: shortcut,
    }));
  };

  const handle_browse_path = async (pathKey: PreferencePathKey) => {
    const currentPath = {
      dataRootPath,
      bottlePrefixPath,
      gameInstallPath,
    }[pathKey];

    const result = (await window.BTIH_API?.invoke(IPC_CHANNELS.APP.SELECT_DIRECTORY.channelName, {
      title: "Select launcher data folder",
      defaultPath: currentPath || undefined,
    })) as SelectDirectoryResultPayload | undefined;

    if (!result || result.canceled || !result.path) {
      return;
    }

    if (pathKey === "bottlePrefixPath") {
      setBottlePrefixPath(result.path);
      return;
    }

    if (pathKey === "gameInstallPath") {
      setGameInstallPath(result.path);
      return;
    }

    update_data_root_draft(result.path);
  };

  const handle_select_bottle_prefix_path = async (currentPath: string): Promise<string | undefined> => {
    const result = (await window.BTIH_API?.invoke(IPC_CHANNELS.APP.SELECT_DIRECTORY.channelName, {
      title: "Select bottle prefix folder",
      defaultPath: currentPath || bottlePrefixPath || undefined,
    })) as SelectDirectoryResultPayload | undefined;

    if (!result || result.canceled || !result.path) {
      return undefined;
    }

    return result.path;
  };

  const handle_reset_path = (pathKey: PreferencePathKey) => {
    if (pathKey === "dataRootPath") {
      update_data_root_draft(DEFAULT_DATA_ROOT_PATH);
      return;
    }

    if (pathKey === "bottlePrefixPath") {
      setBottlePrefixPath(derive_storage_paths_from_data_root(dataRootPath).bottlePrefixPath);
      return;
    }

    if (pathKey === "gameInstallPath") {
      setGameInstallPath(derive_storage_paths_from_data_root(dataRootPath).gameInstallPath);
    }
  };

  const should_reset_deleted_target = (targets: LauncherDataDeleteTarget[], target: LauncherDataDeleteTarget) => {
    return targets.includes("all") || targets.includes(target);
  };

  const handle_delete_launcher_data = async (targets: LauncherDataDeleteTarget[]) => {
    const result = (await window.BTIH_API?.invoke(IPC_CHANNELS.APP.DELETE_LAUNCHER_DATA.channelName, {
      targets,
      dataRootPath,
      wineInstallPath: installPath,
      bottlePrefixPath,
      dxmtCachePath,
    })) as DeleteLauncherDataResultPayload | undefined;

    if (!result || result.failedPaths.length === 0) {
      const deletesSettings = should_reset_deleted_target(targets, "settings");

      if (should_reset_deleted_target(targets, "wineRuntime")) {
        clearWineRuntimeMetadata();
        clearJadeiteRuntimeMetadata();
        setStoreInstallPath(installPath);
        setStoreJadeiteInstallPath(derive_storage_paths_from_data_root(dataRootPath).jadeiteInstallPath);
        void loadWineVersions();
        void loadJadeiteVersions();
      }

      if (should_reset_deleted_target(targets, "bottlePrefixes")) {
        setBottles([]);
      }

      if (should_reset_deleted_target(targets, "dxmtCache")) {
        clearDxmtRuntimeMetadata();
        setStoreDxmtCachePath(dxmtCachePath);
        void loadDxmtVersions();
      }

      if (should_reset_deleted_target(targets, "logs") || should_reset_deleted_target(targets, "bottlePrefixes")) {
        try {
          const snapshot = (await window.BTIH_API?.invoke(
            IPC_CHANNELS.APP.GET_LOG_SNAPSHOT.channelName,
            undefined as never,
          )) as LauncherLogSnapshotPayload | undefined;

          setLogEntries(snapshot?.entries.map(log_entry_from_payload) ?? []);
          setLogSessions(
            snapshot && snapshot.sessions.length > 0
              ? log_session_from_payload(snapshot)
              : [create_fallback_log_session()],
          );
          setLogSources(snapshot ? log_sources_from_payload(snapshot) : []);
        } catch {
          setLogEntries([]);
          setLogSessions([create_fallback_log_session()]);
          setLogSources([]);
        }
      }

      if (deletesSettings) {
        const nextSnapshot: PreferenceDraftSnapshot = {
          locale: resolve_initial_locale(),
          accentColor: resolve_initial_accent_color(),
          themeMode: "system",
          appLoggingLevel: "info",
          debugFlagMode: "preset",
          loggingLevel: "off",
          wineDebugArgs: "",
          shortcuts: DEFAULT_SHORTCUTS,
          autoUpdateEnabled: true,
          closeToTray: false,
          windowStartupSizeMode: "default",
          windowStartupCustomWidth: LAUNCHER_WINDOW_DEFAULT_SIZE.width,
          windowStartupCustomHeight: LAUNCHER_WINDOW_DEFAULT_SIZE.height,
          dataRootPath: DEFAULT_DATA_ROOT_PATH,
          installPath: DEFAULT_WINE_INSTALL_PATH,
          bottlePrefixPath: DEFAULT_BOTTLE_PREFIX_PATH,
          dxmtCachePath: DEFAULT_DXMT_CACHE_PATH,
          gameInstallPath: DEFAULT_GAME_INSTALL_PATH,
        };

        setLocale(nextSnapshot.locale);
        void change_renderer_locale(nextSnapshot.locale);
        setAccentColor(nextSnapshot.accentColor);
        setAppliedAccentColor(nextSnapshot.accentColor);
        setThemeMode(nextSnapshot.themeMode);
        setWindowStartupSizeMode(nextSnapshot.windowStartupSizeMode);
        setWindowStartupCustomWidth(nextSnapshot.windowStartupCustomWidth);
        setWindowStartupCustomHeight(nextSnapshot.windowStartupCustomHeight);
        apply_renderer_theme_mode(nextSnapshot.themeMode);
        setAppLoggingLevel("off");
        setDebugFlagMode("preset");
        setLoggingLevel("off");
        setWineDebugArgs("");
        setShortcuts(DEFAULT_SHORTCUTS);
        setAppliedShortcuts(DEFAULT_SHORTCUTS);
        setAutoUpdateEnabled(true);
        setDataRootPath(DEFAULT_DATA_ROOT_PATH);
        setInstallPath(DEFAULT_WINE_INSTALL_PATH);
        setStoreInstallPath(DEFAULT_WINE_INSTALL_PATH);
        setBottlePrefixPath(DEFAULT_BOTTLE_PREFIX_PATH);
        setDxmtCachePath(DEFAULT_DXMT_CACHE_PATH);
        setGameInstallPath(DEFAULT_GAME_INSTALL_PATH);
        setStoreDxmtCachePath(DEFAULT_DXMT_CACHE_PATH);
        setStoreJadeiteInstallPath(DEFAULT_JADEITE_INSTALL_PATH);
        setSavedPreferenceSnapshot(nextSnapshot);
      }
    }

    return result;
  };

  const handle_open_log_folder = () => {
    void window.BTIH_API?.invoke(IPC_CHANNELS.APP.OPEN_LOG_FOLDER.channelName, undefined as never);
  };

  const handle_open_log_file = (targetPath?: string) => {
    if (!targetPath) {
      return;
    }

    void window.BTIH_API?.invoke(IPC_CHANNELS.APP.OPEN_PATH.channelName, { path: targetPath });
  };

  const handle_reveal_log_file = (targetPath?: string) => {
    if (!targetPath) {
      void window.BTIH_API?.invoke(IPC_CHANNELS.APP.OPEN_LOG_FOLDER.channelName, undefined as never);
      return;
    }

    void window.BTIH_API?.invoke(IPC_CHANNELS.APP.REVEAL_PATH.channelName, { path: targetPath });
  };

  const handle_create_bottle = (input: CreateBottleInput) => {
    update_bottles((currentBottles) => {
      const name = input.name.normalize("NFC").trim();

      if (bottle_name_exists(name, currentBottles)) {
        return currentBottles;
      }

      const now = new Date().toISOString();
      const prefixPath = normalize_bottle_prefix_root(input.prefixPath || bottlePrefixPath, name);
      const bottleId = create_bottle_id(name);
      const bottle: Bottle = {
        id: bottleId,
        bottleIconId: pick_bottle_icon_id(currentBottles, bottleId),
        name,
        description: input.description || name,
        wineVersionId: input.wineVersionId,
        wineRuntimePath: wineVersions.find((version) => version.id === input.wineVersionId)?.path,
        dxmtVersionId: input.dxmtVersionId,
        dxmtPackagePath: input.dxmtVersionId
          ? dxmtVersions.find((version) => version.id === input.dxmtVersionId)?.path
          : undefined,
        jadeiteVersionId: input.jadeiteVersionId,
        path: create_bottle_storage_path(prefixPath, name, bottleId),
        prefixPath,
        status: "ready",
        apps: [],
        createdAt: now,
        updatedAt: now,
      };

      return [...currentBottles, bottle];
    });
  };

  const handle_reorder_bottles = async (orderedBottleIds: string[]) => {
    const reorder = (currentBottles: Bottle[]) => {
      const bottlesById = new Map(currentBottles.map((bottle) => [bottle.id, bottle]));
      const orderedIdSet = new Set(orderedBottleIds);
      const orderedBottles = orderedBottleIds
        .map((bottleId) => bottlesById.get(bottleId))
        .filter((bottle): bottle is Bottle => Boolean(bottle));

      return [
        ...orderedBottles,
        ...currentBottles.filter((bottle) => !orderedIdSet.has(bottle.id)),
      ];
    };
    const nextBottles = reorder(bottlesRef.current);

    bottlesRef.current = nextBottles;
    setBottles(nextBottles);
    await persist_bottles(nextBottles);

    setBottles((currentBottles) => {
      const reorderedBottles = reorder(currentBottles);
      bottlesRef.current = reorderedBottles;
      return reorderedBottles;
    });
  };

  const handle_reorder_bottle_apps = async (bottleId: string, orderedAppIds: string[]) => {
    const updatedAt = new Date().toISOString();
    const reorder = (currentBottles: Bottle[]) => currentBottles.map((bottle) => {
      if (bottle.id !== bottleId) {
        return bottle;
      }

      const appsById = new Map(bottle.apps.map((app) => [app.id, app]));
      const orderedIdSet = new Set(orderedAppIds);
      const orderedApps = orderedAppIds
        .map((appId) => appsById.get(appId))
        .filter((app): app is Bottle["apps"][number] => Boolean(app));

      return {
        ...bottle,
        apps: [
          ...orderedApps,
          ...bottle.apps.filter((app) => !orderedIdSet.has(app.id)),
        ],
        updatedAt,
      };
    });
    const nextBottles = reorder(bottlesRef.current);

    bottlesRef.current = nextBottles;
    setBottles(nextBottles);
    await persist_bottles(nextBottles);

    // Preserve process/session updates that may arrive while the save request
    // is in flight, but apply the selected app order to the latest state.
    setBottles((currentBottles) => {
      const reorderedBottles = reorder(currentBottles);
      bottlesRef.current = reorderedBottles;
      return reorderedBottles;
    });
  };

  const handle_download_bottle_launcher_installer = async (bottleId: string, launcher: BottleLauncherKind) => {
    const bottle = bottles.find((candidateBottle) => candidateBottle.id === bottleId);

    if (!bottle) {
      return;
    }

    const wineVersion = wineVersions.find((version) => version.id === bottle.wineVersionId);
    const wineRuntimePath = bottle.wineRuntimePath ?? wineVersion?.path;
    const dxmtPackagePath = bottle.dxmtVersionId
      ? bottle.dxmtPackagePath ?? dxmtVersions.find((version) => version.id === bottle.dxmtVersionId)?.path
      : undefined;
    const shouldUseDxmt = Boolean(dxmtPackagePath);

    const result = await window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.DOWNLOAD_LAUNCHER_INSTALLER.channelName, {
      bottleId: bottle.id,
      bottleName: bottle.name,
      bottlePath: create_launcher_prefix_path(bottle.path, launcher),
      wineVersionId: bottle.wineVersionId,
      wineRuntimePath,
      launcherOptionsManifest: wineVersion?.launcherOptionsManifest,
      dxmtVersionId: shouldUseDxmt ? bottle.dxmtVersionId : undefined,
      dxmtPackagePath,
      launcher,
    });

    if (!result?.ok) {
      window.alert(result?.error || "Failed to download launcher installer.");
    }
  };

  const handle_install_bottle_launcher = async (
    bottleId: string,
    launcher: BottleLauncherKind,
    installerPath?: string,
  ) => {
    const bottle = bottles.find((candidateBottle) => candidateBottle.id === bottleId);

    if (!bottle) {
      return;
    }

    const wineVersion = wineVersions.find((version) => version.id === bottle.wineVersionId);
    const wineRuntimePath = bottle.wineRuntimePath ?? wineVersion?.path;
    const dxmtPackagePath = bottle.dxmtVersionId
      ? bottle.dxmtPackagePath ?? dxmtVersions.find((version) => version.id === bottle.dxmtVersionId)?.path
      : undefined;
    const shouldUseDxmt = Boolean(dxmtPackagePath);

    const result = await window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.INSTALL_LAUNCHER.channelName, {
      bottleId: bottle.id,
      bottleName: bottle.name,
      bottlePath: create_launcher_prefix_path(bottle.path, launcher),
      wineVersionId: bottle.wineVersionId,
      wineRuntimePath,
      launcherOptionsManifest: wineVersion?.launcherOptionsManifest,
      dxmtVersionId: shouldUseDxmt ? bottle.dxmtVersionId : undefined,
      dxmtPackagePath,
      launcher,
      installerPath,
    });

    if (!result?.ok || !result.refreshBottles) {
      if (!result?.ok) {
        window.alert(result?.error || "Failed to install launcher.");
      }
      return;
    }

    const payload = (await window.BTIH_API?.invoke(
      IPC_CHANNELS.BOTTLE.GET_LIST.channelName,
      undefined as never,
    )) as BottleListPayload | undefined;

    if (payload?.bottles) {
      setBottles(apply_execution_state_to_bottles(
        payload.bottles.map(strip_transient_launcher_tasks),
        executionStateRef.current,
      ));
    }
  };

  const handle_install_bottle_launcher_executable = async (
    bottleId: string,
    launcher: BottleLauncherKind,
  ) => {
    const launcherName = launcher === "steam" ? "Steam" : "HoYoPlay";
    const selectedFile = (await window.BTIH_API?.invoke(
      IPC_CHANNELS.APP.SELECT_FILE.channelName,
      {
        title: `${launcherName} installer EXE 선택`,
        filters: [
          {
            name: "Windows executable",
            extensions: ["exe"],
          },
        ],
      },
    )) as SelectFileResultPayload | undefined;

    if (selectedFile?.canceled || !selectedFile?.path) {
      return;
    }

    setPendingLauncherExecutable({
      bottleId,
      launcher,
      installerPath: selectedFile.path,
    });
  };

  const handle_confirm_bottle_launcher_executable = async () => {
    const pendingExecutable = pendingLauncherExecutable;

    if (!pendingExecutable) {
      return;
    }

    setPendingLauncherExecutable(null);
    await handle_install_bottle_launcher(
      pendingExecutable.bottleId,
      pendingExecutable.launcher,
      pendingExecutable.installerPath,
    );
  };

  const handle_launch_bottle_app = async (bottleId: string, appId: string, executableArgs?: string[]) => {
    const bottle = bottlesRef.current.find((candidateBottle) => candidateBottle.id === bottleId);
    const app = bottle?.apps.find((candidateApp) => candidateApp.id === appId);

    if (!bottle || !app?.executablePath) {
      return;
    }

    const wineVersion = wineVersions.find((version) => version.id === bottle.wineVersionId);
    const wineRuntimePath = bottle.wineRuntimePath ?? wineVersion?.path;
    const shouldPassDxmt = Boolean(bottle.dxmtVersionId);
    const dxmtPackagePath = shouldPassDxmt
      ? bottle.dxmtPackagePath ?? dxmtVersions.find((version) => version.id === bottle.dxmtVersionId)?.path
      : undefined;
    const jadeiteRuntimePath = bottle.jadeiteVersionId
      ? jadeiteVersions.find((version) => version.id === bottle.jadeiteVersionId)?.path
      : undefined;

    // Launch only after pending metadata writes finish. Otherwise a process
    // refresh can reload the previous app options and overwrite a just-saved
    // prefix-wide Wine setting such as LeftCommandIsCtrl.
    await bottlePersistQueueRef.current.catch((error) => {
      console.error("Failed to persist bottle metadata before launch:", error);
    });

    const appPrefixPath = create_bottle_app_prefix_path(bottle.path, app);
    const appExecutablePath = executable_path_for_wine_prefix(app.executablePath, appPrefixPath);
    const result = await (
      window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.RUN_EXECUTABLE.channelName, {
        bottleId: bottle.id,
        bottleName: bottle.name,
        bottlePath: appPrefixPath,
        wineVersionId: bottle.wineVersionId,
        wineRuntimePath,
        launcherOptionsManifest: wineVersion?.launcherOptionsManifest,
        dxmtVersionId: shouldPassDxmt ? bottle.dxmtVersionId : undefined,
        dxmtPackagePath,
        jadeiteVersionId: bottle.jadeiteVersionId,
        jadeiteRuntimePath,
        appId: app.id,
        appName: app.name,
        executablePath: appExecutablePath,
        executableArgs: executableArgs ?? executable_args_for_app(app),
        launchOptions: app.launchOptions,
      }) ?? Promise.resolve(undefined)
    )
      .catch((error) => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }));

    if (!result?.ok) {
      return;
    }

    if (result.refreshBottles) {
      const bottlePayload = (await window.BTIH_API?.invoke(
        IPC_CHANNELS.BOTTLE.GET_LIST.channelName,
        undefined as never,
      )) as BottleListPayload | undefined;

      if (bottlePayload?.bottles) {
        setBottles(apply_execution_state_to_bottles(
          bottlePayload.bottles.map(strip_transient_launcher_tasks),
          executionStateRef.current,
        ));
      }
    }

    update_bottles((currentBottles) =>
      currentBottles.map((currentBottle) =>
        currentBottle.id === bottleId
          ? {
              ...currentBottle,
              apps: currentBottle.apps.map((currentApp) =>
                currentApp.id === appId
                    ? {
                        ...currentApp,
                        lastPlayed: new Date().toLocaleString(),
                        lastPlayedKey: undefined,
                      }
                  : currentApp,
              ),
            }
          : currentBottle,
      ),
    );
  };

  const handle_stop_bottle_app = async (bottleId: string, appId: string) => {
    const bottle = bottles.find((candidateBottle) => candidateBottle.id === bottleId);
    const app = bottle?.apps.find((candidateApp) => candidateApp.id === appId);

    if (!bottle || !app) {
      return;
    }

    await window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.STOP_PROCESS.channelName, {
      bottleId,
      appId,
    });
  };

  const handle_stop_bottle = async (bottleId: string) => {
    const bottle = bottles.find((candidateBottle) => candidateBottle.id === bottleId);

    if (!bottle) {
      throw new Error("Bottle could not be found.");
    }

    const result = await window.BTIH_API?.invoke(
      IPC_CHANNELS.BOTTLE.STOP_BOTTLE_PROCESSES.channelName,
      {
        bottleId: bottle.id,
        bottlePath: bottle.path,
      },
    ) as BottleTaskResultPayload | undefined;

    if (!result?.ok) {
      throw new Error(result?.error ?? "Bottle processes could not be stopped.");
    }
  };

  const remove_bottle_app_locally = (bottleId: string, appId: string, hideFromDiscovery = false) => {
    update_bottles((currentBottles) =>
      currentBottles.map((currentBottle) =>
        currentBottle.id === bottleId
          ? {
              ...currentBottle,
              hiddenAppIds: hideFromDiscovery
                ? [...new Set([...(currentBottle.hiddenAppIds ?? []), appId])]
                : currentBottle.hiddenAppIds,
              apps: currentBottle.apps.filter((currentApp) => currentApp.id !== appId),
            }
          : currentBottle,
      ),
    );
  };

  const handle_delete_bottle_app = (bottleId: string, appId: string) => {
    const bottle = bottles.find((candidateBottle) => candidateBottle.id === bottleId);

    if (!bottle) {
      return;
    }

    void window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.DELETE_APP.channelName, {
      bottleId: bottle.id,
      bottlePath: bottle.path,
      appId,
      mode: "list",
    });
    remove_bottle_app_locally(bottleId, appId, true);
  };

  const handle_delete_bottle_app_files = async (bottleId: string, appId: string) => {
    const bottle = bottles.find((candidateBottle) => candidateBottle.id === bottleId);
    const app = bottle?.apps.find((candidateApp) => candidateApp.id === appId);

    if (!bottle || !app) {
      return;
    }

    remove_bottle_app_locally(bottleId, appId);

    await window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.STOP_PROCESS.channelName, {
      bottleId,
      appId,
    });

    await window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.DELETE_APP.channelName, {
      bottleId: bottle.id,
      bottlePath: bottle.path,
      appId: app.id,
      mode: "files",
    });
  };

  const handle_change_bottle_app_launch_options = async (
    bottleId: string,
    appId: string,
    launchOptions: BottleLaunchOptionsPayload,
  ) => {
    await update_bottles((currentBottles) =>
      currentBottles.map((currentBottle) =>
        currentBottle.id === bottleId
          ? {
              ...currentBottle,
              apps: currentBottle.apps.map((currentApp) =>
                currentApp.id === appId
                  ? {
                      ...currentApp,
                      launchOptions,
                    }
                  : currentApp,
              ),
              updatedAt: new Date().toISOString(),
            }
          : currentBottle,
      ),
    );
  };

  const handle_register_bottle_executable = (
    bottleId: string,
    executablePath: string,
    prefixPath?: string,
    launchOptions?: BottleLaunchOptionsPayload,
  ) => {
    const normalizedPath = executablePath.trim();

    if (!normalizedPath) {
      return;
    }

    const nextBottles = bottles.map((currentBottle) => {
      if (currentBottle.id !== bottleId) {
        return currentBottle;
      }

      const appPrefixPath = prefixPath?.trim() || create_default_wine_prefix_path(currentBottle.path);
      const executablePathForPrefix = executable_path_for_wine_prefix(normalizedPath, appPrefixPath);
      const appId = manual_app_id_from_executable_path(
        appPrefixPath,
        executablePathForPrefix,
      );
      const nextApp = {
        id: appId,
        name: app_name_from_executable_path(executablePathForPrefix),
        subtitle: "Manual executable",
        wineVersionId: currentBottle.wineVersionId,
        executablePath: executablePathForPrefix,
        prefixPath: appPrefixPath,
        source: "manual" as const,
        ...(launchOptions ? { launchOptions } : {}),
        lastPlayed: new Date().toLocaleString(),
        status: "ready" as const,
      };
      const apps = currentBottle.apps.some((app) => app.id === appId)
        ? currentBottle.apps.map((app) => app.id === appId ? { ...app, ...nextApp } : app)
        : [nextApp, ...currentBottle.apps];

      return {
        ...currentBottle,
        apps,
        updatedAt: new Date().toISOString(),
      };
    });

    const projectedBottles = apply_execution_state_to_bottles(
      nextBottles,
      executionStateRef.current,
    );

    update_bottles(() => projectedBottles);
    void window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.SAVE_LIST.channelName, {
      bottles: projectedBottles.map(strip_transient_launcher_tasks),
    });
  };

  const handle_update_bottle_prefixes = (bottleId: string, prefixes: BottlePrefixMetadataPayload[]) => {
    const nextBottles = bottles.map((currentBottle) =>
      currentBottle.id === bottleId
        ? {
            ...currentBottle,
            prefixes,
            updatedAt: new Date().toISOString(),
          }
        : currentBottle,
    );

    update_bottles(() => nextBottles);
    void window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.SAVE_LIST.channelName, {
      bottles: nextBottles.map(strip_transient_launcher_tasks),
    });
  };

  const handle_delete_bottle_prefix = async (bottleId: string, prefix: BottlePrefixMetadataPayload) => {
    const bottle = bottles.find((candidateBottle) => candidateBottle.id === bottleId);

    if (!bottle) {
      return;
    }

    const result = (await window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.DELETE_PREFIX.channelName, {
      bottleId: bottle.id,
      bottlePath: bottle.path,
      prefixId: prefix.id,
      prefixPath: prefix.path,
    })) as DeleteBottlePrefixResultPayload | undefined;

    if (!result?.ok) {
      window.alert(result?.error || "Failed to delete prefix.");
      return;
    }

    const payload = (await window.BTIH_API?.invoke(
      IPC_CHANNELS.BOTTLE.GET_LIST.channelName,
      undefined as never,
    )) as BottleListPayload | undefined;

    if (payload?.bottles) {
      setBottles(apply_execution_state_to_bottles(
        payload.bottles.map(strip_transient_launcher_tasks),
        executionStateRef.current,
      ));
    }
  };

  const handle_rename_bottle = async (bottleId: string, name: string) => {
    const previousBottles = bottlesRef.current;

    try {
      const result = await update_bottles((currentBottles) =>
        currentBottles.map((bottle) => {
          if (bottle.id !== bottleId) {
            return bottle;
          }

          return {
            ...bottle,
            name,
            updatedAt: new Date().toISOString(),
          };
        }),
      );

      if (!result?.bottles) {
        throw new Error("Bottle metadata was not returned after the rename.");
      }

      const nextBottles = apply_execution_state_to_bottles(
        result.bottles.map(strip_transient_launcher_tasks),
        executionStateRef.current,
      );

      bottlesRef.current = nextBottles;
      setBottles(nextBottles);
    } catch (error) {
      bottlesRef.current = previousBottles;
      setBottles(previousBottles);
      throw error;
    }
  };

  const handle_change_bottle_description = (bottleId: string, description: string) => {
    update_bottles((currentBottles) =>
      currentBottles.map((bottle) => bottle.id === bottleId
        ? {
            ...bottle,
            description,
            updatedAt: new Date().toISOString(),
          }
        : bottle),
    );
  };

  const handle_change_bottle_recipe = (
    bottleId: string,
    patch: Partial<Pick<Bottle, "wineVersionId" | "dxmtVersionId" | "jadeiteVersionId">>,
  ) => {
    update_bottles((currentBottles) =>
      currentBottles.map((bottle) => {
        if (bottle.id !== bottleId) {
          return bottle;
        }
        const nextWineVersionId = patch.wineVersionId ?? bottle.wineVersionId;
        const nextDxmtVersionId = patch.dxmtVersionId ?? bottle.dxmtVersionId;

        return {
          ...bottle,
          ...patch,
          wineRuntimePath: wineVersions.find((version) => version.id === nextWineVersionId)?.path,
          dxmtPackagePath: nextDxmtVersionId
            ? dxmtVersions.find((version) => version.id === nextDxmtVersionId)?.path
            : undefined,
          apps: patch.wineVersionId
            ? bottle.apps.map((app) => ({
                ...app,
                wineVersionId: patch.wineVersionId ?? app.wineVersionId,
              }))
            : bottle.apps,
          updatedAt: new Date().toISOString(),
        };
      }),
    );
  };

  const handle_apply_bottle_recipe = async (
    bottleId: string,
    patch: Partial<Pick<Bottle, "wineVersionId" | "dxmtVersionId" | "jadeiteVersionId">> & {
      validateOnly?: boolean;
      reapplyRuntime?: boolean;
      forceReapplyRuntime?: boolean;
    },
    reportProgress: (update: { progress: number; message: string }) => void,
  ) => {
    const bottle = bottles.find((candidateBottle) => candidateBottle.id === bottleId);

    if (!bottle) {
      throw new Error("Bottle을 찾을 수 없습니다.");
    }

    const {
      validateOnly = false,
      reapplyRuntime = false,
      forceReapplyRuntime = false,
      ...recipePatch
    } = patch;
    const isRuntimeReapply = (reapplyRuntime || forceReapplyRuntime) && !validateOnly;
    const isForcedRuntimeReapply = forceReapplyRuntime && !validateOnly;
    const nextWineVersionId = recipePatch.wineVersionId ?? bottle.wineVersionId;
    const nextDxmtVersionId = recipePatch.dxmtVersionId ?? bottle.dxmtVersionId;
    const nextJadeiteVersionId = recipePatch.jadeiteVersionId ?? bottle.jadeiteVersionId;
    const nextWineRuntimePath = wineVersions.find((version) => version.id === nextWineVersionId)?.path ?? bottle.wineRuntimePath;
    const nextDxmtPackagePath = nextDxmtVersionId
      ? dxmtVersions.find((version) => version.id === nextDxmtVersionId)?.path ?? bottle.dxmtPackagePath
      : undefined;
    const nextJadeiteRuntimePath = nextJadeiteVersionId
      ? jadeiteVersions.find((version) => version.id === nextJadeiteVersionId)?.path
      : undefined;
    const recipeRequest = {
      bottleId: bottle.id,
      bottleName: bottle.name,
      bottlePath: bottle.path,
      wineVersionId: nextWineVersionId,
      wineRuntimePath: nextWineRuntimePath,
      dxmtVersionId: nextDxmtVersionId,
      dxmtPackagePath: nextDxmtPackagePath,
      jadeiteVersionId: nextJadeiteVersionId,
      jadeiteRuntimePath: nextJadeiteRuntimePath,
      launcherOptionsManifest: wineVersions.find((version) => version.id === nextWineVersionId)?.launcherOptionsManifest,
    };
    const invoke_recipe = (validateRequest: boolean, reapplyRequest: boolean) =>
      window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.APPLY_RECIPE.channelName, {
        ...recipeRequest,
        validateOnly: validateRequest,
        reapplyRuntime: reapplyRequest,
      }) as Promise<BottleTaskResultPayload | undefined> | undefined;
    const assert_recipe_result = (result: BottleTaskResultPayload | undefined) => {
      if (result && !result.ok) {
        throw new Error(result.error || "Recipe 변경에 실패했습니다.");
      }
    };

    if (validateOnly) {
      reportProgress({
        progress: 35,
        message: "Recipe와 설치된 런타임을 검증하는 중...",
      });
      const validationResult = await invoke_recipe(true, reapplyRuntime);

      assert_recipe_result(validationResult);
      reportProgress({
        progress: 100,
        message: validationResult?.runtimeValidation?.updateRequired
          ? "적용되지 않은 런타임 업데이트가 있습니다."
          : "Recipe와 설치된 런타임이 최신 상태입니다.",
      });
      return {
        runtimeUpdated: false,
      };
    }

    if (isRuntimeReapply && !isForcedRuntimeReapply) {
      reportProgress({
        progress: 18,
        message: "설치된 Wine/DXMT 아티팩트를 검증하는 중...",
      });
      const validationResult = await invoke_recipe(true, true);

      assert_recipe_result(validationResult);

      if (validationResult?.runtimeValidation?.updateRequired === false) {
        reportProgress({
          progress: 100,
          message: "검증 완료 - 이미 최신 런타임이 적용되어 있습니다.",
        });
        return {
          runtimeUpdated: false,
        };
      }
    }

    const activeExecutions = executionStateRef.current.executions.filter((execution) =>
      execution.bottleId === bottleId && execution.phase !== "failed",
    );
    const processCount = new Set(
      activeExecutions.map((execution) => execution.processId).filter(Boolean),
    ).size || activeExecutions.length;

    if (activeExecutions.length > 0) {
      reportProgress({
        progress: 18,
        message: `앱들 종료중... (${processCount})`,
      });

      await window.BTIH_API?.invoke(
        IPC_CHANNELS.BOTTLE.STOP_BOTTLE_PROCESSES.channelName,
        {
          bottleId,
          bottlePath: bottle.path,
        },
      );
    }

    reportProgress({
      progress: activeExecutions.length > 0 ? 58 : 32,
      message: isForcedRuntimeReapply
        ? "현재 설치된 런타임을 강제로 다시 적용하는 중..."
        : isRuntimeReapply
          ? "확인된 런타임 업데이트 적용중..."
          : "레시피 변경중...",
    });

    const unsubscribeRecipeProgress = window.BTIH_API?.on(
      IPC_CHANNELS.BOTTLE.STATUS_UPDATE.channelName,
      (_event, payload: BottleTaskStatusPayload) => {
        if (payload.bottleId !== bottle.id || payload.launcher) {
          return;
        }

        reportProgress({
          progress: Math.min(84, 32 + Math.round(payload.progress * 0.52)),
          message: payload.message || (isForcedRuntimeReapply
            ? "현재 설치된 런타임을 강제로 다시 적용하는 중..."
            : isRuntimeReapply
              ? "확인된 런타임 업데이트 적용중..."
              : "레시피 변경중..."),
        });
      },
    );
    let result;

    try {
      result = await invoke_recipe(false, isRuntimeReapply);
    } finally {
      unsubscribeRecipeProgress?.();
    }

    assert_recipe_result(result);

    if (!isRuntimeReapply) {
      reportProgress({
        progress: 86,
        message: "레시피 저장중...",
      });

      handle_change_bottle_recipe(bottleId, recipePatch);
    }

    await new Promise((resolve) => window.setTimeout(resolve, 240));

    reportProgress({
      progress: 100,
      message: isForcedRuntimeReapply
        ? "현재 설치된 런타임 강제 재적용 완료"
        : isRuntimeReapply
          ? "검증된 런타임 업데이트 적용 완료"
          : "레시피 변경 완료",
    });
    return {
      runtimeUpdated: isRuntimeReapply,
    };
  };

  const handle_delete_bottle = async (bottleId: string) => {
    const bottle = bottles.find((candidateBottle) => candidateBottle.id === bottleId);

    if (!bottle) {
      return;
    }

    setDeletingBottleModal({
      name: bottle.name,
      progress: 8,
      message: `${bottle.name} Bottle 삭제를 준비하는 중...`,
    });
    const progressTimer = window.setInterval(() => {
      setDeletingBottleModal((currentModal) => currentModal
        ? {
            ...currentModal,
            progress: Math.min(88, currentModal.progress + 9),
            message: `${bottle.name} Bottle prefix와 관련 로그를 삭제하는 중...`,
          }
        : currentModal);
    }, 180);

    let result: { ok?: boolean; error?: string } | undefined;

    try {
      result = await window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.DELETE.channelName, {
        bottleId: bottle.id,
        bottlePath: bottle.path,
        bottleName: bottle.name,
      });
    } finally {
      window.clearInterval(progressTimer);
    }

    if (!result?.ok) {
      setDeletingBottleModal({
        name: bottle.name,
        progress: 100,
        message: `${bottle.name} Bottle 삭제에 실패했습니다.`,
      });
      window.setTimeout(() => setDeletingBottleModal(null), 900);
      window.alert(result?.error || "Bottle prefix deletion failed.");
      return;
    }

    setDeletingBottleModal({
      name: bottle.name,
      progress: 100,
      message: `${bottle.name} Bottle 삭제가 완료되었습니다.`,
    });

    update_bottles((currentBottles) => currentBottles.filter((candidateBottle) => candidateBottle.id !== bottleId));
    setLogEntries((currentEntries) => currentEntries.filter((entry) =>
      entry.bottleId !== bottleId && entry.bottleName !== bottle.name,
    ));
    setLogSessions((currentSessions) => currentSessions.filter((session) =>
      session.bottleId !== bottleId && session.bottleName !== bottle.name,
    ));

    try {
      const snapshot = (await window.BTIH_API?.invoke(
        IPC_CHANNELS.APP.GET_LOG_SNAPSHOT.channelName,
        undefined as never,
      )) as LauncherLogSnapshotPayload | undefined;

      if (snapshot) {
        setLogEntries(snapshot.entries.map(log_entry_from_payload));
        setLogSessions(
          snapshot.sessions.length > 0
            ? log_session_from_payload(snapshot)
            : [create_fallback_log_session()],
        );
        setLogSources(log_sources_from_payload(snapshot));
      } else {
        setLogSources([]);
      }
    } catch {
      setLogSources([]);
    }

    window.setTimeout(() => setDeletingBottleModal(null), 520);
  };

  const handle_clear_bottle_dxmt_shader_caches = async (bottleId: string, prefixPaths?: string[]) => {
    const bottle = bottlesRef.current.find((candidateBottle) => candidateBottle.id === bottleId);
    if (!bottle || !window.BTIH_API) return undefined;

    const cacheRoots = [...new Set((prefixPaths?.length ? prefixPaths : [bottle.path])
      .map((prefixPath) => prefixPath.trim())
      .filter(Boolean))];
    const aggregateResult = {
      deletedPaths: [] as string[],
      skippedPaths: [] as Array<{ path: string; reason: string }>,
      failedPaths: [] as Array<{ path: string; error: string }>,
    };

    for (const cacheRoot of cacheRoots) {
      const result = await window.BTIH_API.invoke(IPC_CHANNELS.APP.DELETE_LAUNCHER_DATA.channelName, {
        targets: ["shaderCache"],
        bottlePrefixPath: cacheRoot,
      }) as typeof aggregateResult | undefined;

      if (result) {
        aggregateResult.deletedPaths.push(...result.deletedPaths);
        aggregateResult.skippedPaths.push(...result.skippedPaths);
        aggregateResult.failedPaths.push(...result.failedPaths);
      }
    }

    return aggregateResult;
  };

  const handle_reveal_bottle = (targetPath: string) => {
    void window.BTIH_API?.invoke(IPC_CHANNELS.APP.REVEAL_PATH.channelName, { path: targetPath });
  };

  return (
    <>
    <LauncherView
      activeView={activeView}
      onViewChange={handle_view_change}
      onQuit={() => window.BTIH_API?.send(IPC_CHANNELS.APP.QUIT.channelName, undefined as never)}
      onMinimize={() => window.BTIH_API?.send(IPC_CHANNELS.APP.MINIMIZE.channelName, undefined as never)}
      onMaximize={() => window.BTIH_API?.send(IPC_CHANNELS.APP.MAXIMIZE.channelName, undefined as never)}
      isMac={isMac}
      locale={locale}
      accentColor={accentColor}
      themeMode={themeMode}
      appLoggingLevel={appLoggingLevel}
      debugFlagMode={debugFlagMode}
      loggingLevel={loggingLevel}
      wineDebugArgs={wineDebugArgs}
      shortcuts={shortcuts}
      bottlePrefixPath={bottlePrefixPath}
      dxmtCachePath={dxmtCachePath}
      gameInstallPath={gameInstallPath}
      autoUpdateEnabled={autoUpdateEnabled}
      closeToTray={closeToTray}
      hasUnsavedPreferenceChanges={hasUnsavedPreferenceChanges}
      windowStartupSizeMode={windowStartupSizeMode}
      windowStartupCustomWidth={windowStartupCustomWidth}
      windowStartupCustomHeight={windowStartupCustomHeight}
      appUpdateStatus={appUpdateStatus}
      dataRootPath={dataRootPath}
      isDeveloperOnAir={isDeveloperOnAir}
      bottles={bottles}
      logEntries={logEntries}
      logSessions={logSessions}
      logSources={logSources}
      wineVersions={wineVersions}
      dxmtVersions={dxmtVersions}
      jadeiteVersions={jadeiteVersions}
      selectedWineVersion={selectedWineVersion}
      selectedWineVersionId={selectedWineVersionId}
      selectedDxmtVersionId={selectedDxmtVersionId}
      selectedJadeiteVersionId={selectedJadeiteVersionId}
      installPath={installPath}
      isLoadingWineVersions={isLoadingWineVersions}
      isLoadingDxmtVersions={isLoadingDxmtVersions}
      isLoadingJadeiteVersions={isLoadingJadeiteVersions}
      onSelectWineVersion={selectWineVersion}
      onSelectDxmtVersion={selectDxmtVersion}
      onSelectJadeiteVersion={selectJadeiteVersion}
      onInstallWineVersion={(versionId) => void installWineVersion(versionId)}
      onInstallDxmtVersion={(versionId) => void installDxmtVersion(versionId)}
      onInstallJadeiteVersion={(versionId) => void installJadeiteVersion(versionId)}
      onDeleteWineVersion={(versionId) => void deleteWineVersion(versionId)}
      onDeleteDxmtVersion={(versionId) => void deleteDxmtVersion(versionId)}
      onDeleteJadeiteVersion={(versionId) => void deleteJadeiteVersion(versionId)}
      onCreateBottle={handle_create_bottle}
      onReorderBottles={handle_reorder_bottles}
      onRenameBottle={handle_rename_bottle}
      onChangeBottleDescription={handle_change_bottle_description}
      onRevealBottle={handle_reveal_bottle}
      onStopBottle={handle_stop_bottle}
      onDeleteBottle={handle_delete_bottle}
      onClearBottleDxmtShaderCaches={handle_clear_bottle_dxmt_shader_caches}
      onSelectBottlePrefixPath={handle_select_bottle_prefix_path}
      onDownloadBottleLauncherInstaller={(bottleId, launcher) => void handle_download_bottle_launcher_installer(bottleId, launcher)}
      onInstallBottleLauncher={(bottleId, launcher) => void handle_install_bottle_launcher(bottleId, launcher)}
      onInstallBottleLauncherExecutable={(bottleId, launcher) => void handle_install_bottle_launcher_executable(bottleId, launcher)}
      onLaunchBottleApp={(bottleId, appId) => void handle_launch_bottle_app(bottleId, appId)}
      onStopBottleApp={(bottleId, appId) => void handle_stop_bottle_app(bottleId, appId)}
      onDeleteBottleApp={handle_delete_bottle_app}
      onDeleteBottleAppFiles={(bottleId, appId) => void handle_delete_bottle_app_files(bottleId, appId)}
      onReorderBottleApps={handle_reorder_bottle_apps}
      onRegisterBottleExecutable={handle_register_bottle_executable}
      onUpdateBottlePrefixes={handle_update_bottle_prefixes}
      onDeleteBottlePrefix={handle_delete_bottle_prefix}
      onChangeBottleAppLaunchOptions={handle_change_bottle_app_launch_options}
      onChangeBottleRecipe={handle_change_bottle_recipe}
      onApplyBottleRecipe={handle_apply_bottle_recipe}
      onOpenLogFolder={handle_open_log_folder}
      onOpenLogFile={handle_open_log_file}
      onRevealLogFile={handle_reveal_log_file}
      onDataRootPathChange={update_data_root_draft}
      onInstallPathChange={setInstallPath}
      onLocaleChange={handle_locale_change}
      onAccentColorChange={setAccentColor}
      onThemeModeChange={setThemeMode}
      onAppLoggingLevelChange={setAppLoggingLevel}
      onDebugFlagModeChange={setDebugFlagMode}
      onLoggingLevelChange={setLoggingLevel}
      onWineDebugArgsChange={setWineDebugArgs}
      onShortcutChange={handle_shortcut_change}
      onAutoUpdateEnabledChange={setAutoUpdateEnabled}
      onCloseToTrayChange={setCloseToTray}
      onWindowStartupSizeModeChange={setWindowStartupSizeMode}
      onWindowStartupCustomWidthChange={setWindowStartupCustomWidth}
      onWindowStartupCustomHeightChange={setWindowStartupCustomHeight}
      onCheckForUpdates={handle_check_for_updates}
      onInstallUpdate={handle_install_update}
      onBottlePrefixPathChange={setBottlePrefixPath}
      onDxmtCachePathChange={setDxmtCachePath}
      onGameInstallPathChange={setGameInstallPath}
      onBrowsePath={handle_browse_path}
      onResetPath={handle_reset_path}
      onDeleteLauncherData={handle_delete_launcher_data}
      onSavePreference={handle_save_preference}
    />
    <Dialog
      open={Boolean(pendingLauncherExecutable)}
      title={t("main.installers.directRunWarningTitle")}
      description={t("main.installers.directRunWarningDescription")}
      tone="warning"
      placement="center"
      widthClassName="max-w-xl"
      onClose={() => setPendingLauncherExecutable(null)}
      closeOnBackdrop={false}
      showCloseButton={false}
      actions={[
        {
          label: t("common.actions.cancel"),
          variant: "secondary",
          autoFocus: true,
          onClick: () => setPendingLauncherExecutable(null),
        },
        {
          label: t("common.actions.run"),
          variant: "primary",
          onClick: () => void handle_confirm_bottle_launcher_executable(),
        },
      ]}
    >
      <Stack className="gap-3">
        <Text className="rounded-lg border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
          {t("main.installers.directRunWarningBody", {
            launcher: pendingLauncherExecutable?.launcher === "steam" ? "Steam" : "HoYoPlay",
          })}
        </Text>
        <Stack className="gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3">
          <Text className="text-xs font-semibold text-slate-300">
            {t("main.installers.directRunTarget", {
              launcher: pendingLauncherExecutable?.launcher === "steam" ? "Steam" : "HoYoPlay",
            })}
          </Text>
          <Text className="break-all font-mono text-[11px] leading-5 text-slate-400">
            {pendingLauncherExecutable?.installerPath}
          </Text>
        </Stack>
      </Stack>
    </Dialog>
    <Dialog
      open={Boolean(deletingBottleModal)}
      title="Bottle 삭제 중"
      description={deletingBottleModal ? `${deletingBottleModal.name} 데이터를 정리하고 있습니다.` : undefined}
      tone="warning"
      placement="center"
      widthClassName="max-w-md"
      onClose={() => undefined}
      closeOnBackdrop={false}
      showCloseButton={false}
      actions={[]}
    >
      <Stack className="gap-3">
        <Text className="rounded-lg border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
          {deletingBottleModal?.message}
        </Text>
        <ProgressBar
          progressValue={deletingBottleModal?.progress ?? 0}
          showValue
          size="sm"
          tone="blue"
          animated={(deletingBottleModal?.progress ?? 0) < 100}
        />
      </Stack>
    </Dialog>
    <Dialog
      open={Boolean(unsupportedWineModal)}
      title="지원하지 않는 Wine 런타임"
      description={unsupportedWineModal ? `${unsupportedWineModal.appName} 실행에 필요한 Wine 구성 요소가 현재 선택한 Wine에 없습니다.` : undefined}
      tone="danger"
      placement="center"
      widthClassName="max-w-xl"
      onClose={() => setUnsupportedWineModal(null)}
      actions={[
        {
          label: "확인",
          variant: "primary",
          autoFocus: true,
          onClick: () => setUnsupportedWineModal(null),
        },
      ]}
    >
      <Stack className="gap-3">
        <Text className="rounded-lg border border-red-300/25 bg-red-400/10 px-3 py-2 text-xs leading-5 text-red-100">
          HoYo 게임 실행은 일반 Wine 실행이 아니라 HoYoPlay FIFO 감시, 게임별 prefix, DXMT 런타임 파일, 필요 시 Proton Steam stub을 함께 사용하는 특수 실행 경로입니다.
        </Text>
        <Text className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-5 text-slate-300">
          선택한 Wine: {unsupportedWineModal?.wineVersionId}
        </Text>
        <Text className="max-h-40 overflow-auto rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-[11px] leading-5 text-slate-400">
          {unsupportedWineModal?.details}
        </Text>
      </Stack>
    </Dialog>
    <RuntimeInstallFailureDialog
      failure={runtimeInstallFailure}
      onClose={clearRuntimeInstallFailure}
    />
    <AppUpdateInstallDialog progress={appUpdateInstallProgress} />
    </>
  );
};

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(<App />);
