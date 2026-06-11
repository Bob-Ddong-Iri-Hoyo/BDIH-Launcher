import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../style/index.css";
import { BDIH_YOUTUBE_HANDLE, STEAM_GAME_LAUNCH_ARGUMENT } from "../../../Common/Constant/RuntimeSources";
import { AppUpdateStatusPayload, BottleLauncherKind, BottleListPayload, BottleProcessExitPayload, BottleTaskStatusPayload, DEBUG_FLAG_MODES, DebugFlagMode, DeleteLauncherDataResultPayload, IPC_CHANNELS, LAUNCHER_LOG_LEVELS, LAUNCHER_SHORTCUT_ACTIONS, LauncherDataDeleteTarget, LauncherLogEntryPayload, LauncherLogLevel, LauncherLogSnapshotPayload, LauncherPreferencePayload, LauncherShortcutAction, LauncherShortcutMap, RENDERER_THEME_MODES, RendererThemeMode, SelectDirectoryResultPayload, YouTubeLiveStatusPayload } from "../../../Common/Types/IPC";
import type { LogEntry, LogSession, LogSourceOption } from "../../Component/LogViewer";
import { RendererViewKey } from "../../Component/MainFrame";
import { change_renderer_locale, is_supported_locale, resolve_initial_locale, SupportedLocale } from "../../I18n";
import { useSystemStore } from "../../Store";
import { AccentColor, apply_renderer_accent_color, resolve_initial_accent_color } from "../../Theme";
import { LauncherView } from "./MainView";
import type { Bottle, CreateBottleInput } from "./MainView";
import type { PreferencePathKey } from "../PreferenceView/PreferenceView";

const DEFAULT_WINE_INSTALL_PATH = "~/Library/Application Support/BDIH Launcher/Wine";
const DEFAULT_BOTTLE_PREFIX_PATH = "~/Library/Application Support/BDIH Launcher/Bottles";
const DEFAULT_DXMT_CACHE_PATH = "~/Library/Application Support/BDIH Launcher/DXMT";
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
  installPath: string;
  bottlePrefixPath: string;
  dxmtCachePath: string;
}

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

function apply_renderer_theme_mode(themeMode: RendererThemeMode) {
  document.documentElement.dataset.themeMode = themeMode;
}

function create_bottle_id(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "bottle";
  return `${slug}-${Date.now().toString(36)}`;
}

function create_default_bottle_path(rootPath: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "bottle";
  return `${rootPath.replace(/\/$/, "")}/${slug}`;
}

function normalize_bottle_prefix_root(rootPath: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "bottle";
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
  if (!bottle.launcherTasks) {
    return bottle;
  }

  return {
    ...bottle,
    launcherTasks: undefined,
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
    normalize_preference_path(left.installPath) === normalize_preference_path(right.installPath) &&
    normalize_preference_path(left.bottlePrefixPath) === normalize_preference_path(right.bottlePrefixPath) &&
    normalize_preference_path(left.dxmtCachePath) === normalize_preference_path(right.dxmtCachePath) &&
    LAUNCHER_SHORTCUT_ACTIONS.every((action) => left.shortcuts[action] === right.shortcuts[action])
  );
}

function normalize_preference_path(targetPath: string): string {
  return targetPath.trim().replace(/\/+$/, "");
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
  const [installPath, setInstallPath] = useState(DEFAULT_WINE_INSTALL_PATH);
  const [bottlePrefixPath, setBottlePrefixPath] = useState(DEFAULT_BOTTLE_PREFIX_PATH);
  const [dxmtCachePath, setDxmtCachePath] = useState(DEFAULT_DXMT_CACHE_PATH);
  const [wineDebugArgs, setWineDebugArgs] = useState("");
  const [shortcuts, setShortcuts] = useState<LauncherShortcutMap>(DEFAULT_SHORTCUTS);
  const [appliedShortcuts, setAppliedShortcuts] = useState<LauncherShortcutMap>(DEFAULT_SHORTCUTS);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);
  const [appUpdateStatus, setAppUpdateStatus] = useState<AppUpdateStatusPayload>();
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
  const isMac = window.BTIH_ENV?.platform === "darwin";
  const {
    wineVersions,
    dxmtVersions,
    selectedWineVersionId,
    selectedDxmtVersionId,
    isLoadingWineVersions,
    isLoadingDxmtVersions,
    loadWineVersions,
    loadDxmtVersions,
    installWineVersion,
    installDxmtVersion,
    selectWineVersion,
    selectDxmtVersion,
    setInstallPath: setStoreInstallPath,
    setDxmtCachePath: setStoreDxmtCachePath,
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
    installPath,
    bottlePrefixPath,
    dxmtCachePath,
  }), [
    accentColor,
    appLoggingLevel,
    autoUpdateEnabled,
    bottlePrefixPath,
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
    setInstallPath(snapshot.installPath);
    setStoreInstallPath(snapshot.installPath);
    setBottlePrefixPath(snapshot.bottlePrefixPath);
    setDxmtCachePath(snapshot.dxmtCachePath);
    setStoreDxmtCachePath(snapshot.dxmtCachePath);
  }

  useEffect(() => {
    void loadWineVersions();
    void loadDxmtVersions();
    const unsubscribe = subscribeWineStatus();

    return () => {
      unsubscribe();
    };
  }, [loadDxmtVersions, loadWineVersions, subscribeWineStatus]);

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
      const payload = (await window.BTIH_API?.invoke(
        IPC_CHANNELS.BOTTLE.GET_LIST.channelName,
        undefined as never,
      )) as BottleListPayload | undefined;

      if (isMounted && payload?.bottles) {
        setBottles(payload.bottles.map(strip_transient_launcher_tasks));
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
        update_bottles((currentBottles) =>
          currentBottles.map((bottle) => {
            if (bottle.id !== payload.bottleId) {
              return bottle;
            }

            if (payload.launcher) {
              const nextLauncherTasks = { ...bottle.launcherTasks };

              if (payload.stage === "ready") {
                delete nextLauncherTasks[payload.launcher];
              } else {
                nextLauncherTasks[payload.launcher] = {
                  stage: payload.stage,
                  progress: payload.progress,
                  message: payload.message,
                };
              }

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
        const nextAccentColor = resolve_initial_accent_color();
        setLocale(nextLocale);
        void change_renderer_locale(nextLocale);
        setAccentColor(nextAccentColor);
        setAppliedAccentColor(nextAccentColor);

        const nextInstallPath =
          typeof preference.wineInstallPath === "string" && preference.wineInstallPath.length > 0
            ? preference.wineInstallPath
            : DEFAULT_WINE_INSTALL_PATH;
        setInstallPath(nextInstallPath);
        setStoreInstallPath(nextInstallPath);
        setBottlePrefixPath(
          typeof preference.bottlePrefixPath === "string" && preference.bottlePrefixPath.length > 0
            ? preference.bottlePrefixPath
            : DEFAULT_BOTTLE_PREFIX_PATH,
        );
        setDxmtCachePath(
          typeof preference.dxmtCachePath === "string" && preference.dxmtCachePath.length > 0
            ? preference.dxmtCachePath
            : DEFAULT_DXMT_CACHE_PATH,
        );
        setStoreDxmtCachePath(
          typeof preference.dxmtCachePath === "string" && preference.dxmtCachePath.length > 0
            ? preference.dxmtCachePath
            : DEFAULT_DXMT_CACHE_PATH,
        );
        const nextThemeMode = is_renderer_theme_mode(preference.themeMode) ? preference.themeMode : "system";
        setThemeMode(nextThemeMode);
        apply_renderer_theme_mode(nextThemeMode);
        setAppLoggingLevel(is_launcher_log_level(preference.appLoggingLevel) ? preference.appLoggingLevel : "off");
        setDebugFlagMode(is_debug_flag_mode(preference.debugFlagMode) ? preference.debugFlagMode : "preset");
        setLoggingLevel(is_launcher_log_level(preference.loggingLevel) ? preference.loggingLevel : "off");
        setWineDebugArgs(typeof preference.wineDebugArgs === "string" ? preference.wineDebugArgs : "");
        const nextAutoCheckUpdates = typeof preference.autoCheckUpdates === "boolean" ? preference.autoCheckUpdates : true;
        setAutoUpdateEnabled(nextAutoCheckUpdates);
        const nextShortcuts = normalize_shortcuts(preference.shortcuts);
        setShortcuts(nextShortcuts);
        setAppliedShortcuts(nextShortcuts);
        setSavedPreferenceSnapshot({
          locale: nextLocale,
          accentColor: nextAccentColor,
          installPath: nextInstallPath,
          bottlePrefixPath: typeof preference.bottlePrefixPath === "string" && preference.bottlePrefixPath.length > 0
            ? preference.bottlePrefixPath
            : DEFAULT_BOTTLE_PREFIX_PATH,
          dxmtCachePath: typeof preference.dxmtCachePath === "string" && preference.dxmtCachePath.length > 0
            ? preference.dxmtCachePath
            : DEFAULT_DXMT_CACHE_PATH,
          themeMode: nextThemeMode,
          appLoggingLevel: is_launcher_log_level(preference.appLoggingLevel) ? preference.appLoggingLevel : "off",
          debugFlagMode: is_debug_flag_mode(preference.debugFlagMode) ? preference.debugFlagMode : "preset",
          loggingLevel: is_launcher_log_level(preference.loggingLevel) ? preference.loggingLevel : "off",
          wineDebugArgs: typeof preference.wineDebugArgs === "string" ? preference.wineDebugArgs : "",
          shortcuts: nextShortcuts,
          autoUpdateEnabled: nextAutoCheckUpdates,
        });
        setIsPreferenceLoaded(true);
      } catch {
        if (isMounted) {
          setInstallPath(DEFAULT_WINE_INSTALL_PATH);
          setStoreInstallPath(DEFAULT_WINE_INSTALL_PATH);
          setBottlePrefixPath(DEFAULT_BOTTLE_PREFIX_PATH);
          setDxmtCachePath(DEFAULT_DXMT_CACHE_PATH);
          setStoreDxmtCachePath(DEFAULT_DXMT_CACHE_PATH);
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
  }, [setLocale, setStoreDxmtCachePath, setStoreInstallPath]);

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
    }).then(() => {
      setSavedPreferenceSnapshot(currentPreferenceSnapshot);
      setAppliedShortcuts(shortcuts);
      setAppliedAccentColor(accentColor);
      setStoreInstallPath(installPath);
      setStoreDxmtCachePath(dxmtCachePath);
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
      wineInstallPath: installPath,
      bottlePrefixPath,
      dxmtCachePath,
    }[pathKey];

    const result = (await window.BTIH_API?.invoke(IPC_CHANNELS.APP.SELECT_DIRECTORY.channelName, {
      title: pathKey === "wineInstallPath" ? "Select Wine runtime folder" : pathKey === "bottlePrefixPath" ? "Select bottle prefix folder" : "Select DXMT cache folder",
      defaultPath: currentPath || undefined,
    })) as SelectDirectoryResultPayload | undefined;

    if (!result || result.canceled || !result.path) {
      return;
    }

    if (pathKey === "wineInstallPath") {
      setInstallPath(result.path);
      return;
    }

    if (pathKey === "bottlePrefixPath") {
      setBottlePrefixPath(result.path);
      return;
    }

    setDxmtCachePath(result.path);
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
    if (pathKey === "wineInstallPath") {
      setInstallPath(DEFAULT_WINE_INSTALL_PATH);
      return;
    }

    if (pathKey === "bottlePrefixPath") {
      setBottlePrefixPath(DEFAULT_BOTTLE_PREFIX_PATH);
      return;
    }

    setDxmtCachePath(DEFAULT_DXMT_CACHE_PATH);
  };

  const should_reset_deleted_target = (targets: LauncherDataDeleteTarget[], target: LauncherDataDeleteTarget) => {
    return targets.includes("all") || targets.includes(target);
  };

  const handle_delete_launcher_data = async (targets: LauncherDataDeleteTarget[]) => {
    const result = (await window.BTIH_API?.invoke(IPC_CHANNELS.APP.DELETE_LAUNCHER_DATA.channelName, {
      targets,
      wineInstallPath: installPath,
      bottlePrefixPath,
      dxmtCachePath,
    })) as DeleteLauncherDataResultPayload | undefined;

    if (!result || result.failedPaths.length === 0) {
      if (should_reset_deleted_target(targets, "wineRuntime")) {
        setInstallPath(DEFAULT_WINE_INSTALL_PATH);
      }

      if (should_reset_deleted_target(targets, "bottlePrefixes")) {
        setBottlePrefixPath(DEFAULT_BOTTLE_PREFIX_PATH);
        update_bottles(() => []);
      }

      if (should_reset_deleted_target(targets, "dxmtCache")) {
        setDxmtCachePath(DEFAULT_DXMT_CACHE_PATH);
        setStoreDxmtCachePath(DEFAULT_DXMT_CACHE_PATH);
      }

      if (should_reset_deleted_target(targets, "settings")) {
        setAppLoggingLevel("off");
        setDebugFlagMode("preset");
        setLoggingLevel("off");
        setWineDebugArgs("");
      }
    }
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
      path: create_bottle_path_from_prefix(prefixPath, input.name),
      prefixPath,
      status: "updating",
      setupTask: {
        stage: "setup",
        progress: 1,
        message: "Preparing bottle prefix...",
      },
      apps: [],
      createdAt: now,
      updatedAt: now,
    };

    update_bottles((currentBottles) => [bottle, ...currentBottles]);
    void setup_bottle_prefix(bottle);
  };

  const setup_bottle_prefix = async (bottle: Bottle) => {
    const wineRuntimePath = wineVersions.find((version) => version.id === bottle.wineVersionId)?.path;
    const dxmtPackagePath = dxmtVersions.find((version) => version.id === bottle.dxmtVersionId)?.path;

    await window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.SETUP_PREFIX.channelName, {
      bottleId: bottle.id,
      bottleName: bottle.name,
      bottlePath: bottle.path,
      wineVersionId: bottle.wineVersionId,
      wineRuntimePath,
      dxmtVersionId: bottle.dxmtVersionId,
      dxmtPackagePath,
    });
  };

  const handle_install_bottle_launcher = async (bottleId: string, launcher: BottleLauncherKind) => {
    const bottle = bottles.find((candidateBottle) => candidateBottle.id === bottleId);

    if (!bottle) {
      return;
    }

    const wineRuntimePath = wineVersions.find((version) => version.id === bottle.wineVersionId)?.path;
    const dxmtPackagePath = dxmtVersions.find((version) => version.id === bottle.dxmtVersionId)?.path;

    const result = await window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.INSTALL_LAUNCHER.channelName, {
      bottleId: bottle.id,
      bottleName: bottle.name,
      bottlePath: bottle.path,
      wineVersionId: bottle.wineVersionId,
      wineRuntimePath,
      dxmtVersionId: bottle.dxmtVersionId,
      dxmtPackagePath,
      launcher,
    });

    if (!result?.ok) {
      return;
    }

    const payload = (await window.BTIH_API?.invoke(
      IPC_CHANNELS.BOTTLE.GET_LIST.channelName,
      undefined as never,
    )) as BottleListPayload | undefined;

    if (payload?.bottles) {
      setBottles(payload.bottles.map(strip_transient_launcher_tasks));
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

    const wineRuntimePath = wineVersions.find((version) => version.id === bottle.wineVersionId)?.path;

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

    const result = await (
      window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.RUN_EXECUTABLE.channelName, {
        bottleId: bottle.id,
        bottleName: bottle.name,
        bottlePath: bottle.path,
        wineVersionId: bottle.wineVersionId,
        wineRuntimePath,
        appId: app.id,
        appName: app.name,
        executablePath: app.executablePath,
        executableArgs: executableArgs ?? executable_args_for_app(app),
      }) ?? Promise.resolve(undefined)
    )
      .catch((error) => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }));

    if (!result?.ok) {
      const launchError = result?.error || "Failed to start Wine process.";

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
      currentBottles.map((bottle) =>
        bottle.id === bottleId ? { ...bottle, name } : bottle,
      ),
    );
  };

  const handle_delete_bottle = async (bottleId: string) => {
    const bottle = bottles.find((candidateBottle) => candidateBottle.id === bottleId);

    if (!bottle) {
      return;
    }

    const result = await window.BTIH_API?.invoke(IPC_CHANNELS.BOTTLE.DELETE.channelName, {
      bottleId: bottle.id,
      bottlePath: bottle.path,
    });

    if (!result?.ok) {
      window.alert(result?.error || "Bottle prefix deletion failed.");
      return;
    }

    update_bottles((currentBottles) => currentBottles.filter((candidateBottle) => candidateBottle.id !== bottleId));
  };

  const handle_reveal_bottle = (targetPath: string) => {
    void window.BTIH_API?.invoke(IPC_CHANNELS.APP.OPEN_PATH.channelName, { path: targetPath });
  };

  return (
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
      appUpdateStatus={appUpdateStatus}
      isDeveloperOnAir={isDeveloperOnAir}
      bottles={bottles}
      logEntries={logEntries}
      logSessions={logSessions}
      logSources={logSources}
      wineVersions={wineVersions}
      dxmtVersions={dxmtVersions}
      selectedWineVersion={selectedWineVersion}
      selectedWineVersionId={selectedWineVersionId}
      selectedDxmtVersionId={selectedDxmtVersionId}
      installPath={installPath}
      isLoadingWineVersions={isLoadingWineVersions}
      isLoadingDxmtVersions={isLoadingDxmtVersions}
      onSelectWineVersion={selectWineVersion}
      onSelectDxmtVersion={selectDxmtVersion}
      onInstallWineVersion={(versionId) => void installWineVersion(versionId)}
      onInstallDxmtVersion={(versionId) => void installDxmtVersion(versionId)}
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
      onRegisterBottleExecutable={handle_register_bottle_executable}
      onOpenLogFolder={handle_open_log_folder}
      onOpenLogFile={handle_open_log_file}
      onRevealLogFile={handle_reveal_log_file}
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
      onCheckForUpdates={handle_check_for_updates}
      onBottlePrefixPathChange={setBottlePrefixPath}
      onDxmtCachePathChange={setDxmtCachePath}
      onResetInstallPath={() => {
        setInstallPath(DEFAULT_WINE_INSTALL_PATH);
        setBottlePrefixPath(DEFAULT_BOTTLE_PREFIX_PATH);
        setDxmtCachePath(DEFAULT_DXMT_CACHE_PATH);
      }}
      onBrowsePath={handle_browse_path}
      onResetPath={handle_reset_path}
      onDeleteLauncherData={(targets) => void handle_delete_launcher_data(targets)}
      onSavePreference={handle_save_preference}
    />
  );
};

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(<App />);
