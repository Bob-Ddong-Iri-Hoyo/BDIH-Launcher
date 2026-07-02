import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../style/index.css";
import { BDIH_YOUTUBE_HANDLE, STEAM_GAME_LAUNCH_ARGUMENT } from "../../../Common/Constant/RuntimeSources";
import { AppUpdateStatusPayload, BottleLaunchOptionsPayload, BottleLauncherKind, BottleListPayload, BottlePrefixSessionPayload, BottleProcessExitPayload, BottleTaskStatusPayload, DEBUG_FLAG_MODES, DebugFlagMode, DeleteLauncherDataResultPayload, IPC_CHANNELS, LAUNCHER_LOG_LEVELS, LAUNCHER_SHORTCUT_ACTIONS, LauncherDataDeleteTarget, LauncherLogEntryPayload, LauncherLogLevel, LauncherLogSnapshotPayload, LauncherPreferencePayload, LauncherShortcutAction, LauncherShortcutMap, RENDERER_THEME_MODES, RendererThemeMode, SelectDirectoryResultPayload, YouTubeLiveStatusPayload } from "../../../Common/Types/IPC";
import { bottle_name_to_slug, create_bottle_app_prefix_path, create_bottle_path_from_name, create_launcher_prefix_path, launcher_from_bottle_app } from "../../../Common/Util/BottlePath";
import { Dialog } from "../../Component/Dialog";
import type { LogEntry, LogSession, LogSourceOption } from "../../Component/LogViewer";
import { RendererViewKey } from "../../Component/MainFrame";
import { ProgressBar } from "../../Component/ProgressBar";
import { Stack, Text } from "../../Component/Primitives";
import { change_renderer_locale, is_supported_locale, resolve_initial_locale, SupportedLocale } from "../../I18n";
import { useSystemStore } from "../../Store";
import { AccentColor, apply_renderer_accent_color, is_accent_color, resolve_initial_accent_color } from "../../Theme";
import { LauncherView } from "./MainView";
import type { Bottle, CreateBottleInput } from "./MainView";
import type { PreferencePathKey } from "../PreferenceView/PreferenceView";

const DEFAULT_DATA_ROOT_PATH = "~/Library/Application Support/BDIH Launcher";
const DEFAULT_WINE_INSTALL_PATH = create_data_root_child_path(DEFAULT_DATA_ROOT_PATH, "Wine");
const DEFAULT_BOTTLE_PREFIX_PATH = create_data_root_child_path(DEFAULT_DATA_ROOT_PATH, "Bottles");
const DEFAULT_DXMT_CACHE_PATH = create_data_root_child_path(DEFAULT_DATA_ROOT_PATH, "DXMT");
const DEFAULT_JADEITE_INSTALL_PATH = create_data_root_child_path(DEFAULT_DATA_ROOT_PATH, "dependencies/jadeite");
const DEFAULT_SHORTCUTS: LauncherShortcutMap = {
  launch: "Command + Return",
  logs: "Command + L",
  preferences: "Command + ,",
};
const DEVELOPER_YOUTUBE_HANDLE = BDIH_YOUTUBE_HANDLE;

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
  dataRootPath: string;
  installPath: string;
  bottlePrefixPath: string;
  dxmtCachePath: string;
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

function parent_path_from_slash_path(targetPath: string): string {
  const trimmedPath = targetPath.trim().replace(/\/+$/, "");
  const lastSeparatorIndex = trimmedPath.lastIndexOf("/");

  return lastSeparatorIndex > 0 ? trimmedPath.slice(0, lastSeparatorIndex) : trimmedPath;
}

function derive_storage_paths_from_data_root(dataRootPath: string): {
  installPath: string;
  bottlePrefixPath: string;
  dxmtCachePath: string;
  jadeiteInstallPath: string;
} {
  return {
    installPath: create_data_root_child_path(dataRootPath, "Wine"),
    bottlePrefixPath: create_data_root_child_path(dataRootPath, "Bottles"),
    dxmtCachePath: create_data_root_child_path(dataRootPath, "DXMT"),
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

function create_default_bottle_path(rootPath: string, name: string): string {
  const slug = bottle_name_to_slug(name);
  return `${rootPath.replace(/\/$/, "")}/${slug}`;
}

function normalize_bottle_prefix_root(rootPath: string, name: string): string {
  const slug = bottle_name_to_slug(name);
  const trimmedRoot = rootPath.trim().replace(/\/+$/, "") || DEFAULT_BOTTLE_PREFIX_PATH;

  if (trimmedRoot.split("/").pop()?.toLowerCase() === slug) {
    return trimmedRoot.split("/").slice(0, -1).join("/") || trimmedRoot;
  }

  return trimmedRoot;
}

function create_bottle_path_from_prefix(rootPath: string, name: string): string {
  const prefixPath = normalize_bottle_prefix_root(rootPath, name);

  return create_default_bottle_path(prefixPath, name);
}

function app_name_from_executable_path(executablePath: string): string {
  const normalizedPath = executablePath.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").pop() || "Program";
  return fileName.replace(/\.[^.]+$/, "") || fileName;
}

function app_id_from_executable_path(executablePath: string): string {
  return `manual:${executablePath.toLowerCase()}`;
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

function update_log_sessions(sessions: LogSession[], entry: LauncherLogEntryPayload): LogSession[] {
  if (!sessions.some((session) => session.id === entry.sessionId)) {
    const isWineSession = entry.category === "wine" || Boolean(entry.bottleId);
    const label = isWineSession && entry.bottleName
      ? `${entry.bottleName} / ${entry.source}`
      : entry.sessionId;

    return [
      ...sessions,
      {
        id: entry.sessionId,
        label,
        startedAt: entry.timestamp,
        kind: isWineSession ? "bottle" : "app",
        bottleId: entry.bottleId,
        bottleName: entry.bottleName,
        count: 1,
        isRunning: true,
      },
    ];
  }

  return sessions.map((session) =>
    session.id === entry.sessionId
      ? {
          ...session,
          count: (session.count ?? 0) + 1,
          isRunning: true,
        }
      : session,
  );
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
    if (!app.processId) {
      return app;
    }

    const { processId: _processId, ...rest } = app;
    return rest;
  });

  if (!bottle.launcherTasks) {
    return {
      ...bottle,
      apps,
    };
  }

  const launcherTasks = Object.fromEntries(
    Object.entries(bottle.launcherTasks).filter(([, task]) => task?.stage === "ready"),
  ) as Bottle["launcherTasks"];

  return {
    ...bottle,
    apps,
    launcherTasks: launcherTasks && Object.keys(launcherTasks).length > 0 ? launcherTasks : undefined,
  };
}

function launcher_app_id_from_session(session: BottlePrefixSessionPayload): string | undefined {
  return session.appId ?? session.launcher;
}

function app_matches_prefix_session(app: Bottle["apps"][number], session: BottlePrefixSessionPayload): boolean {
  const sessionAppId = launcher_app_id_from_session(session);

  if (sessionAppId) {
    return app.id === sessionAppId;
  }

  return Boolean(session.launcher && app.id === session.launcher);
}

function apply_prefix_sessions_to_bottles(
  bottles: Bottle[],
  sessions: Iterable<BottlePrefixSessionPayload>,
): Bottle[] {
  const activeSessions = [...sessions].filter((session) => session.isRunning);

  if (activeSessions.length === 0) {
    return bottles;
  }

  return bottles.map((bottle) => {
    const bottleSessions = activeSessions.filter((session) => session.bottleId === bottle.id);

    if (bottleSessions.length === 0) {
      return bottle;
    }

    return {
      ...bottle,
      apps: bottle.apps.map((app) => {
        const session = bottleSessions.find((candidateSession) =>
          app_matches_prefix_session(app, candidateSession),
        );

        return session
          ? {
              ...app,
              processId: session.processId,
              launchError: undefined,
            }
          : app;
      }),
    };
  });
}

function apply_prefix_session_update_to_bottles(
  bottles: Bottle[],
  session: BottlePrefixSessionPayload,
): Bottle[] {
  if (!session.isRunning) {
    return bottles.map((bottle) =>
      bottle.id === session.bottleId
        ? {
            ...bottle,
            apps: bottle.apps.map((app) =>
              app.processId === session.processId && app_matches_prefix_session(app, session)
                ? {
                    ...app,
                    processId: undefined,
                    launchError: session.error,
                  }
                : app,
            ),
          }
        : bottle,
    );
  }

  return apply_prefix_sessions_to_bottles(bottles, [session]);
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
    normalize_preference_path(left.dataRootPath) === normalize_preference_path(right.dataRootPath) &&
    normalize_preference_path(left.installPath) === normalize_preference_path(right.installPath) &&
    normalize_preference_path(left.bottlePrefixPath) === normalize_preference_path(right.bottlePrefixPath) &&
    normalize_preference_path(left.dxmtCachePath) === normalize_preference_path(right.dxmtCachePath) &&
    LAUNCHER_SHORTCUT_ACTIONS.every((action) => left.shortcuts[action] === right.shortcuts[action])
  );
}

function normalize_preference_path(targetPath: string): string {
  return targetPath.trim().replace(/\/+$/, "");
}

function is_unsupported_wine_runtime_error(message: string): boolean {
  const normalizedMessage = message.toLowerCase();

  return normalizedMessage.includes("unsupported wine runtime")
    || normalizedMessage.includes("hoyo zzz route")
    || normalizedMessage.includes("share/protonextras")
    || normalizedMessage.includes("lib/wine directories");
}

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<RendererViewKey>("dashboard");
  const [locale, setLocale] = useState<SupportedLocale>(() => resolve_initial_locale());
  const [accentColor, setAccentColor] = useState<AccentColor>(() => resolve_initial_accent_color());
  const [appliedAccentColor, setAppliedAccentColor] = useState<AccentColor>(() => resolve_initial_accent_color());
  const [themeMode, setThemeMode] = useState<RendererThemeMode>("system");
  const [appLoggingLevel, setAppLoggingLevel] = useState<LauncherLogLevel>("off");
  const [debugFlagMode, setDebugFlagMode] = useState<DebugFlagMode>("preset");
  const [loggingLevel, setLoggingLevel] = useState<LauncherLogLevel>("off");
  const [dataRootPath, setDataRootPath] = useState(DEFAULT_DATA_ROOT_PATH);
  const [installPath, setInstallPath] = useState(DEFAULT_WINE_INSTALL_PATH);
  const [bottlePrefixPath, setBottlePrefixPath] = useState(DEFAULT_BOTTLE_PREFIX_PATH);
  const [dxmtCachePath, setDxmtCachePath] = useState(DEFAULT_DXMT_CACHE_PATH);
  const [wineDebugArgs, setWineDebugArgs] = useState("");
  const [shortcuts, setShortcuts] = useState<LauncherShortcutMap>(DEFAULT_SHORTCUTS);
  const [appliedShortcuts, setAppliedShortcuts] = useState<LauncherShortcutMap>(DEFAULT_SHORTCUTS);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);
  const [closeToTray, setCloseToTray] = useState(false);
  const [appUpdateStatus, setAppUpdateStatus] = useState<AppUpdateStatusPayload>();
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
  const [isPreferenceLoaded, setIsPreferenceLoaded] = useState(false);
  const [savedPreferenceSnapshot, setSavedPreferenceSnapshot] = useState<PreferenceDraftSnapshot>(() => ({
    locale: resolve_initial_locale(),
    accentColor: resolve_initial_accent_color(),
    themeMode: "system",
    appLoggingLevel: "off",
    debugFlagMode: "preset",
    loggingLevel: "off",
    wineDebugArgs: "",
    shortcuts: DEFAULT_SHORTCUTS,
    autoUpdateEnabled: true,
    closeToTray: false,
    dataRootPath: DEFAULT_DATA_ROOT_PATH,
    installPath: DEFAULT_WINE_INSTALL_PATH,
    bottlePrefixPath: DEFAULT_BOTTLE_PREFIX_PATH,
    dxmtCachePath: DEFAULT_DXMT_CACHE_PATH,
  }));
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [logSessions, setLogSessions] = useState<LogSession[]>([]);
  const [logSources, setLogSources] = useState<LogSourceOption[]>([]);
  const [isDeveloperOnAir, setIsDeveloperOnAir] = useState(false);
  const exitedProcessIdsRef = useRef(new Set<string>());
  const activePrefixSessionsRef = useRef(new Map<string, BottlePrefixSessionPayload>());
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
    dataRootPath,
    installPath,
    bottlePrefixPath,
    dxmtCachePath,
  }), [
    accentColor,
    appLoggingLevel,
    autoUpdateEnabled,
    bottlePrefixPath,
    closeToTray,
    dataRootPath,
    debugFlagMode,
    dxmtCachePath,
    installPath,
    locale,
    loggingLevel,
    shortcuts,
    themeMode,
    wineDebugArgs,
  ]);
  const hasUnsavedPreferenceChanges = isPreferenceLoaded && !preference_snapshots_equal(currentPreferenceSnapshot, savedPreferenceSnapshot);

  function persist_bottles(nextBottles: Bottle[]) {
    void window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.SAVE_LIST.channelName, {
      bottles: nextBottles.map(strip_transient_launcher_tasks),
    });
  }

  function update_bottles(updater: (currentBottles: Bottle[]) => Bottle[]) {
    setBottles((currentBottles) => {
      const nextBottles = updater(currentBottles);
      persist_bottles(nextBottles);
      return nextBottles;
    });
  }

  function update_data_root_draft(nextDataRootPath: string) {
    const nextStoragePaths = derive_storage_paths_from_data_root(nextDataRootPath);
    const currentDefaultBottlePrefixPath = derive_storage_paths_from_data_root(dataRootPath).bottlePrefixPath;
    const usesCustomBottlePrefixPath = normalize_preference_path(bottlePrefixPath) !== normalize_preference_path(currentDefaultBottlePrefixPath);

    setDataRootPath(nextDataRootPath);
    setInstallPath(nextStoragePaths.installPath);
    setBottlePrefixPath(usesCustomBottlePrefixPath ? bottlePrefixPath : nextStoragePaths.bottlePrefixPath);
    setDxmtCachePath(nextStoragePaths.dxmtCachePath);
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
    setDataRootPath(snapshot.dataRootPath);
    setInstallPath(snapshot.installPath);
    setStoreInstallPath(snapshot.installPath);
    setBottlePrefixPath(snapshot.bottlePrefixPath);
    setDxmtCachePath(snapshot.dxmtCachePath);
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

    void refresh_developer_live_status();
    const intervalId = window.setInterval(refresh_developer_live_status, 60_000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [activeView]);

  useEffect(() => {
    let isMounted = true;

    async function load_bottle_metadata() {
      try {
        const payload = (await window.BTIH_API?.invoke(
          IPC_CHANNELS.BOTTLE.GET_LIST.channelName,
          undefined as never,
        )) as BottleListPayload | undefined;

        if (isMounted && payload?.bottles) {
          setBottles(apply_prefix_sessions_to_bottles(
            payload.bottles.map(strip_transient_launcher_tasks),
            activePrefixSessionsRef.current.values(),
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
      IPC_CHANNELS.BOTTLE.PREFIX_SESSION_UPDATE.channelName,
      (_event, payload: BottlePrefixSessionPayload) => {
        if (payload.isRunning) {
          activePrefixSessionsRef.current.set(payload.processId, payload);
        } else {
          activePrefixSessionsRef.current.delete(payload.processId);
        }

        setBottles((currentBottles) =>
          apply_prefix_session_update_to_bottles(currentBottles, payload),
        );
      },
    );

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const unsubscribe = window.BTIH_API?.on(
      IPC_CHANNELS.BOTTLE.PROCESS_EXIT.channelName,
      (_event, payload: BottleProcessExitPayload) => {
        exitedProcessIdsRef.current.add(payload.processId);
        window.setTimeout(() => {
          exitedProcessIdsRef.current.delete(payload.processId);
        }, 30_000);
        update_bottles((currentBottles) =>
          currentBottles.map((bottle) => ({
            ...bottle,
            apps: bottle.apps.map((app) =>
              app.processId === payload.processId
                ? {
                    ...app,
                    processId: undefined,
                    launchError: payload.error,
                  }
                : app,
            ),
          })),
        );
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

        setLogEntries(snapshot.entries.map(log_entry_from_payload));
        setLogSessions(
          snapshot.sessions.length > 0
            ? log_session_from_payload(snapshot)
            : [create_fallback_log_session()],
        );
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
        setLogEntries((currentEntries) => append_log_entry(currentEntries, entry));
        setLogSessions((currentSessions) => update_log_sessions(currentSessions, entry));
        setLogSources((currentSources) => update_log_sources(currentSources, entry));
      },
    );

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    return window.BTIH_API?.on(IPC_CHANNELS.APP.UPDATE_STATUS.channelName, (_event, payload: AppUpdateStatusPayload) => {
      setAppUpdateStatus(payload);
    });
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
        setDataRootPath(nextDataRootPath);
        setInstallPath(nextInstallPath);
        setStoreInstallPath(nextInstallPath);
        setBottlePrefixPath(nextBottlePrefixPath);
        setDxmtCachePath(nextDxmtCachePath);
        setStoreDxmtCachePath(nextDxmtCachePath);
        setStoreJadeiteInstallPath(nextStoragePaths.jadeiteInstallPath);
        const nextThemeMode = is_renderer_theme_mode(preference.themeMode) ? preference.themeMode : "system";
        setThemeMode(nextThemeMode);
        apply_renderer_theme_mode(nextThemeMode);
        setAppLoggingLevel(is_launcher_log_level(preference.appLoggingLevel) ? preference.appLoggingLevel : "off");
        setDebugFlagMode(is_debug_flag_mode(preference.debugFlagMode) ? preference.debugFlagMode : "preset");
        setLoggingLevel(is_launcher_log_level(preference.loggingLevel) ? preference.loggingLevel : "off");
        setWineDebugArgs(typeof preference.wineDebugArgs === "string" ? preference.wineDebugArgs : "");
        const nextAutoCheckUpdates = typeof preference.autoCheckUpdates === "boolean" ? preference.autoCheckUpdates : true;
        setAutoUpdateEnabled(nextAutoCheckUpdates);
        const nextCloseToTray = typeof preference.closeToTray === "boolean" ? preference.closeToTray : false;
        setCloseToTray(nextCloseToTray);
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
          themeMode: nextThemeMode,
          appLoggingLevel: is_launcher_log_level(preference.appLoggingLevel) ? preference.appLoggingLevel : "off",
          debugFlagMode: is_debug_flag_mode(preference.debugFlagMode) ? preference.debugFlagMode : "preset",
          loggingLevel: is_launcher_log_level(preference.loggingLevel) ? preference.loggingLevel : "off",
          wineDebugArgs: typeof preference.wineDebugArgs === "string" ? preference.wineDebugArgs : "",
          shortcuts: nextShortcuts,
          autoUpdateEnabled: nextAutoCheckUpdates,
          closeToTray: nextCloseToTray,
        });
        setIsPreferenceLoaded(true);
      } catch {
        if (isMounted) {
          setDataRootPath(DEFAULT_DATA_ROOT_PATH);
          setInstallPath(DEFAULT_WINE_INSTALL_PATH);
          setStoreInstallPath(DEFAULT_WINE_INSTALL_PATH);
          setBottlePrefixPath(DEFAULT_BOTTLE_PREFIX_PATH);
          setDxmtCachePath(DEFAULT_DXMT_CACHE_PATH);
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
          setSavedPreferenceSnapshot({
            locale: resolve_initial_locale(),
            accentColor: resolve_initial_accent_color(),
            themeMode: "system",
            appLoggingLevel: "off",
            debugFlagMode: "preset",
            loggingLevel: "off",
            wineDebugArgs: "",
            shortcuts: DEFAULT_SHORTCUTS,
            autoUpdateEnabled: true,
            closeToTray: false,
            dataRootPath: DEFAULT_DATA_ROOT_PATH,
            installPath: DEFAULT_WINE_INSTALL_PATH,
            bottlePrefixPath: DEFAULT_BOTTLE_PREFIX_PATH,
            dxmtCachePath: DEFAULT_DXMT_CACHE_PATH,
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
      themeMode,
      appLoggingLevel,
      debugFlagMode,
      loggingLevel,
      wineDebugArgs,
      shortcuts,
      autoCheckUpdates: autoUpdateEnabled,
      closeToTray,
    }).then(() => {
      setSavedPreferenceSnapshot(currentPreferenceSnapshot);
      setAppliedShortcuts(shortcuts);
      setAppliedAccentColor(accentColor);
      setStoreInstallPath(installPath);
      setStoreDxmtCachePath(dxmtCachePath);
      setStoreJadeiteInstallPath(derive_storage_paths_from_data_root(dataRootPath).jadeiteInstallPath);
      void change_renderer_locale(locale);
      apply_renderer_theme_mode(themeMode);
    });
  };

  const handle_check_for_updates = () => {
    window.BTIH_API?.send(IPC_CHANNELS.APP.UPDATE.channelName, undefined as never);
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
          appLoggingLevel: "off",
          debugFlagMode: "preset",
          loggingLevel: "off",
          wineDebugArgs: "",
          shortcuts: DEFAULT_SHORTCUTS,
          autoUpdateEnabled: true,
          closeToTray: false,
          dataRootPath: DEFAULT_DATA_ROOT_PATH,
          installPath: DEFAULT_WINE_INSTALL_PATH,
          bottlePrefixPath: DEFAULT_BOTTLE_PREFIX_PATH,
          dxmtCachePath: DEFAULT_DXMT_CACHE_PATH,
        };

        setLocale(nextSnapshot.locale);
        void change_renderer_locale(nextSnapshot.locale);
        setAccentColor(nextSnapshot.accentColor);
        setAppliedAccentColor(nextSnapshot.accentColor);
        setThemeMode(nextSnapshot.themeMode);
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
    const now = new Date().toISOString();
    const prefixPath = normalize_bottle_prefix_root(input.prefixPath || bottlePrefixPath, input.name);
    const bottle: Bottle = {
      id: create_bottle_id(input.name),
      name: input.name,
      description: input.description || input.name,
      wineVersionId: input.wineVersionId,
      dxmtVersionId: input.dxmtVersionId,
      jadeiteVersionId: input.jadeiteVersionId,
      path: create_bottle_path_from_prefix(prefixPath, input.name),
      prefixPath,
      status: "ready",
      apps: [],
      createdAt: now,
      updatedAt: now,
    };

    update_bottles((currentBottles) => [bottle, ...currentBottles]);
  };

  const handle_install_bottle_launcher = async (bottleId: string, launcher: BottleLauncherKind) => {
    const bottle = bottles.find((candidateBottle) => candidateBottle.id === bottleId);

    if (!bottle) {
      return;
    }

    const wineVersion = wineVersions.find((version) => version.id === bottle.wineVersionId);
    const wineRuntimePath = wineVersion?.path;
    const shouldUseDxmt = launcher !== "steam" && Boolean(bottle.dxmtVersionId);
    const dxmtPackagePath = shouldUseDxmt
      ? dxmtVersions.find((version) => version.id === bottle.dxmtVersionId)?.path
      : undefined;

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
    });

    if (!result?.ok || !result.refreshBottles) {
      return;
    }

    const payload = (await window.BTIH_API?.invoke(
      IPC_CHANNELS.BOTTLE.GET_LIST.channelName,
      undefined as never,
    )) as BottleListPayload | undefined;

    if (payload?.bottles) {
      setBottles(apply_prefix_sessions_to_bottles(
        payload.bottles.map(strip_transient_launcher_tasks),
        activePrefixSessionsRef.current.values(),
      ));
    }
  };

  const handle_launch_bottle_app = async (bottleId: string, appId: string, executableArgs?: string[]) => {
    const bottle = bottles.find((candidateBottle) => candidateBottle.id === bottleId);
    const app = bottle?.apps.find((candidateApp) => candidateApp.id === appId);

    if (!bottle || !app?.executablePath) {
      return;
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
                      launchError: undefined,
                    }
                  : currentApp,
              ),
            }
          : currentBottle,
      ),
    );

    const wineVersion = wineVersions.find((version) => version.id === bottle.wineVersionId);
    const wineRuntimePath = wineVersion?.path;
    const shouldPassDxmt = launcher_from_bottle_app(app) !== "steam" && Boolean(bottle.dxmtVersionId);
    const shouldRequireDxmtBeforeLaunch = app.id !== "hoyoplay" && shouldPassDxmt;
    const dxmtPackagePath = shouldPassDxmt
      ? dxmtVersions.find((version) => version.id === bottle.dxmtVersionId)?.path
      : undefined;
    const jadeiteRuntimePath = bottle.jadeiteVersionId
      ? jadeiteVersions.find((version) => version.id === bottle.jadeiteVersionId)?.path
      : undefined;

    if (!wineRuntimePath) {
      const launchError = `Wine runtime is not installed or extracted: ${bottle.wineVersionId}`;

      update_bottles((currentBottles) =>
        currentBottles.map((currentBottle) =>
          currentBottle.id === bottleId
            ? {
                ...currentBottle,
                apps: currentBottle.apps.map((currentApp) =>
                  currentApp.id === appId
                    ? {
                        ...currentApp,
                        processId: undefined,
                        launchError,
                      }
                    : currentApp,
                ),
              }
            : currentBottle,
        ),
      );
      return;
    }

    if (shouldRequireDxmtBeforeLaunch && bottle.dxmtVersionId && !dxmtPackagePath) {
      const launchError = `DXMT runtime is not downloaded: ${bottle.dxmtVersionId}`;

      update_bottles((currentBottles) =>
        currentBottles.map((currentBottle) =>
          currentBottle.id === bottleId
            ? {
                ...currentBottle,
                apps: currentBottle.apps.map((currentApp) =>
                  currentApp.id === appId
                    ? {
                        ...currentApp,
                        processId: undefined,
                        launchError,
                      }
                    : currentApp,
                ),
              }
            : currentBottle,
        ),
      );
      return;
    }

    const result = await (
      window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.RUN_EXECUTABLE.channelName, {
        bottleId: bottle.id,
        bottleName: bottle.name,
        bottlePath: create_bottle_app_prefix_path(bottle.path, app),
        wineVersionId: bottle.wineVersionId,
        wineRuntimePath,
        launcherOptionsManifest: wineVersion?.launcherOptionsManifest,
        dxmtVersionId: shouldPassDxmt ? bottle.dxmtVersionId : undefined,
        dxmtPackagePath,
        jadeiteVersionId: bottle.jadeiteVersionId,
        jadeiteRuntimePath,
        appId: app.id,
        appName: app.name,
        executablePath: app.executablePath,
        executableArgs: executableArgs ?? executable_args_for_app(app),
        launchOptions: app.launchOptions,
      }) ?? Promise.resolve(undefined)
    )
      .catch((error) => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }));

    if (!result?.ok) {
      const launchError = result?.error || "Failed to start Wine process.";

      if (is_unsupported_wine_runtime_error(launchError)) {
        setUnsupportedWineModal({
          appName: app.name,
          wineVersionId: bottle.wineVersionId,
          details: launchError,
        });
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
                        processId: undefined,
                        launchError,
                      }
                    : currentApp,
                ),
              }
            : currentBottle,
        ),
      );
      return;
    }

    const processAlreadyExited = result.processId ? exitedProcessIdsRef.current.has(result.processId) : false;

    if (result.processId && processAlreadyExited) {
      exitedProcessIdsRef.current.delete(result.processId);
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
                      processId: processAlreadyExited ? undefined : result.processId,
                      launchError: undefined,
                    }
                  : currentApp,
              ),
            }
          : currentBottle,
      ),
    );
  };

  const handle_launch_bottle_app_with_args = (bottleId: string, appId: string, executableArgs: string[]) => {
    void handle_launch_bottle_app(bottleId, appId, executableArgs);
  };

  const handle_stop_bottle_app = async (bottleId: string, appId: string) => {
    const bottle = bottles.find((candidateBottle) => candidateBottle.id === bottleId);
    const app = bottle?.apps.find((candidateApp) => candidateApp.id === appId);

    if (!app?.processId) {
      return;
    }

    await window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.STOP_PROCESS.channelName, {
      processId: app.processId,
    });

    update_bottles((currentBottles) =>
      currentBottles.map((currentBottle) =>
        currentBottle.id === bottleId
          ? {
              ...currentBottle,
              apps: currentBottle.apps.map((currentApp) =>
                currentApp.id === appId
                  ? {
                      ...currentApp,
                      processId: undefined,
                    }
                  : currentApp,
              ),
            }
          : currentBottle,
      ),
    );
  };

  const handle_delete_bottle_app = (bottleId: string, appId: string) => {
    update_bottles((currentBottles) =>
      currentBottles.map((currentBottle) =>
        currentBottle.id === bottleId
          ? {
              ...currentBottle,
              apps: currentBottle.apps.filter((currentApp) => currentApp.id !== appId),
            }
          : currentBottle,
      ),
    );
  };

  const handle_delete_bottle_app_files = async (bottleId: string, appId: string) => {
    const bottle = bottles.find((candidateBottle) => candidateBottle.id === bottleId);
    const app = bottle?.apps.find((candidateApp) => candidateApp.id === appId);

    if (!bottle || !app) {
      return;
    }

    if (app.processId) {
      await window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.STOP_PROCESS.channelName, {
        processId: app.processId,
      });
    }

    await window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.DELETE_APP.channelName, {
      bottleId: bottle.id,
      bottlePath: bottle.path,
      appId: app.id,
    });

    const payload = (await window.BTIH_API?.invoke(
      IPC_CHANNELS.BOTTLE.GET_LIST.channelName,
      undefined as never,
    )) as BottleListPayload | undefined;

    if (payload?.bottles) {
      setBottles(apply_prefix_sessions_to_bottles(
        payload.bottles.map(strip_transient_launcher_tasks),
        activePrefixSessionsRef.current.values(),
      ));
      return;
    }

    handle_delete_bottle_app(bottleId, appId);
  };

  const handle_change_bottle_app_launch_options = (
    bottleId: string,
    appId: string,
    launchOptions: BottleLaunchOptionsPayload,
  ) => {
    update_bottles((currentBottles) =>
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

  const handle_register_bottle_executable = (bottleId: string, executablePath: string) => {
    const normalizedPath = executablePath.trim();

    if (!normalizedPath) {
      return;
    }

    update_bottles((currentBottles) =>
      currentBottles.map((currentBottle) => {
        if (currentBottle.id !== bottleId) {
          return currentBottle;
        }

        const appId = app_id_from_executable_path(normalizedPath);
        const nextApp = {
          id: appId,
          name: app_name_from_executable_path(normalizedPath),
          subtitle: "Manual executable",
          wineVersionId: currentBottle.wineVersionId,
          executablePath: normalizedPath,
          source: "manual" as const,
          lastPlayed: new Date().toLocaleString(),
          status: "ready" as const,
        };
        const apps = currentBottle.apps.some((app) => app.id === appId)
          ? currentBottle.apps.map((app) => app.id === appId ? { ...app, ...nextApp } : app)
          : [nextApp, ...currentBottle.apps];

        return {
          ...currentBottle,
          apps,
        };
      }),
    );
  };

  const handle_rename_bottle = (bottleId: string, name: string) => {
    update_bottles((currentBottles) =>
      currentBottles.map((bottle) => {
        if (bottle.id !== bottleId) {
          return bottle;
        }

        const prefixPath = bottle.prefixPath || parent_path_from_slash_path(bottle.path);

        return {
          ...bottle,
          name,
          path: create_bottle_path_from_name(prefixPath, name),
          prefixPath,
          updatedAt: new Date().toISOString(),
        };
      }),
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

        return {
          ...bottle,
          ...patch,
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
      autoUpdateEnabled={autoUpdateEnabled}
      closeToTray={closeToTray}
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
      onRenameBottle={handle_rename_bottle}
      onRevealBottle={handle_reveal_bottle}
      onDeleteBottle={handle_delete_bottle}
      onSelectBottlePrefixPath={handle_select_bottle_prefix_path}
      onInstallBottleLauncher={(bottleId, launcher) => void handle_install_bottle_launcher(bottleId, launcher)}
      onLaunchBottleApp={(bottleId, appId) => void handle_launch_bottle_app(bottleId, appId)}
      onLaunchBottleAppWithArgs={handle_launch_bottle_app_with_args}
      onStopBottleApp={(bottleId, appId) => void handle_stop_bottle_app(bottleId, appId)}
      onDeleteBottleApp={handle_delete_bottle_app}
      onDeleteBottleAppFiles={(bottleId, appId) => void handle_delete_bottle_app_files(bottleId, appId)}
      onRegisterBottleExecutable={handle_register_bottle_executable}
      onChangeBottleAppLaunchOptions={handle_change_bottle_app_launch_options}
      onChangeBottleRecipe={handle_change_bottle_recipe}
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
      onCheckForUpdates={handle_check_for_updates}
      onBottlePrefixPathChange={setBottlePrefixPath}
      onDxmtCachePathChange={setDxmtCachePath}
      onBrowsePath={handle_browse_path}
      onResetPath={handle_reset_path}
      onDeleteLauncherData={handle_delete_launcher_data}
      onSavePreference={handle_save_preference}
    />
    <Dialog
      open={Boolean(deletingBottleModal)}
      title="Bottle 삭제 중"
      description={deletingBottleModal ? `${deletingBottleModal.name} 데이터를 정리하고 있습니다.` : undefined}
      tone="warning"
      placement="center"
      widthClassName="max-w-md"
      onClose={() => undefined}
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
    </>
  );
};

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(<App />);
