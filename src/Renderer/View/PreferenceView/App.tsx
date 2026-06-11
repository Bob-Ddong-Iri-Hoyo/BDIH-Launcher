import React from "react";
import { createRoot } from "react-dom/client";
import "../../style/index.css";
import { AppUpdateStatusPayload, DEBUG_FLAG_MODES, DebugFlagMode, DeleteLauncherDataResultPayload, IPC_CHANNELS, LAUNCHER_LOG_LEVELS, LAUNCHER_SHORTCUT_ACTIONS, LauncherDataDeleteTarget, LauncherLogLevel, LauncherPreferencePayload, LauncherShortcutAction, LauncherShortcutMap, RENDERER_THEME_MODES, RendererThemeMode, SelectDirectoryResultPayload, YouTubeLiveStatusPayload } from "../../../Common/Types/IPC";
import { BDIH_GITHUB_URL, BDIH_SITE_URL, BDIH_YOUTUBE_HANDLE, BDIH_YOUTUBE_URL } from "../../../Common/Constant/RuntimeSources";
import { change_renderer_locale, is_supported_locale, resolve_initial_locale, SupportedLocale } from "../../I18n";
import { AccentColor, apply_renderer_accent_color, resolve_initial_accent_color } from "../../Theme";
import { PreferencePathKey, PreferenceView } from "./PreferenceView";

const DEVELOPER_YOUTUBE_HANDLE = BDIH_YOUTUBE_HANDLE;
const DEVELOPER_SITE_URL = BDIH_SITE_URL;
const DEVELOPER_GITHUB_URL = BDIH_GITHUB_URL;
const DEVELOPER_YOUTUBE_URL = BDIH_YOUTUBE_URL;
const DEFAULT_WINE_INSTALL_PATH = "~/Library/Application Support/BDIH Launcher/Wine";
const DEFAULT_BOTTLE_PREFIX_PATH = "~/Library/Application Support/BDIH Launcher/Bottles";
const DEFAULT_DXMT_CACHE_PATH = "~/Library/Application Support/BDIH Launcher/DXMT";
const DEFAULT_SHORTCUTS: LauncherShortcutMap = {
  launch: "Command + Return",
  logs: "Command + L",
  preferences: "Command + ,",
};

function is_non_empty_string(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
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

function apply_renderer_theme_mode(themeMode: RendererThemeMode) {
  document.documentElement.dataset.themeMode = themeMode;
}

const App: React.FC = () => {
  const [locale, setLocale] = React.useState<SupportedLocale>(() => resolve_initial_locale());
  const [accentColor, setAccentColor] = React.useState<AccentColor>(() => resolve_initial_accent_color());
  const [themeMode, setThemeMode] = React.useState<RendererThemeMode>("system");
  const [installPath, setInstallPath] = React.useState(DEFAULT_WINE_INSTALL_PATH);
  const [bottlePrefixPath, setBottlePrefixPath] = React.useState(DEFAULT_BOTTLE_PREFIX_PATH);
  const [dxmtCachePath, setDxmtCachePath] = React.useState(DEFAULT_DXMT_CACHE_PATH);
  const [gameInstallPath, setGameInstallPath] = React.useState("");
  const [closeToTray, setCloseToTray] = React.useState(false);
  const [appLoggingLevel, setAppLoggingLevel] = React.useState<LauncherLogLevel>("off");
  const [debugFlagMode, setDebugFlagMode] = React.useState<DebugFlagMode>("preset");
  const [loggingLevel, setLoggingLevel] = React.useState<LauncherLogLevel>("off");
  const [wineDebugArgs, setWineDebugArgs] = React.useState("");
  const [shortcuts, setShortcuts] = React.useState<LauncherShortcutMap>(DEFAULT_SHORTCUTS);
  const [isDeveloperOnAir, setIsDeveloperOnAir] = React.useState(false);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = React.useState(true);
  const [appUpdateStatus, setAppUpdateStatus] = React.useState<AppUpdateStatusPayload>();

  React.useEffect(() => {
    apply_renderer_accent_color(accentColor);
  }, [accentColor]);

  React.useEffect(() => {
    let isMounted = true;

    async function load_preference() {
      try {
        const preference = (await window.BTIH_API?.invoke(
          IPC_CHANNELS.APP.GET_PREFERENCE.channelName,
          undefined as never,
        )) as LauncherPreferencePayload | undefined;

        if (isMounted && preference) {
          const nextLocale = is_supported_locale(preference.language) ? preference.language : resolve_initial_locale();
          const nextAutoCheckUpdates = typeof preference.autoCheckUpdates === "boolean" ? preference.autoCheckUpdates : true;
          const nextWineInstallPath = is_non_empty_string(preference.wineInstallPath) ? preference.wineInstallPath : DEFAULT_WINE_INSTALL_PATH;
          const nextBottlePrefixPath = is_non_empty_string(preference.bottlePrefixPath) ? preference.bottlePrefixPath : DEFAULT_BOTTLE_PREFIX_PATH;
          const nextDxmtCachePath = is_non_empty_string(preference.dxmtCachePath) ? preference.dxmtCachePath : DEFAULT_DXMT_CACHE_PATH;
          const nextGameInstallPath = is_non_empty_string(preference.gameInstallPath) ? preference.gameInstallPath : "";
          const nextCloseToTray = typeof preference.closeToTray === "boolean" ? preference.closeToTray : false;
          const nextThemeMode = is_renderer_theme_mode(preference.themeMode) ? preference.themeMode : "system";
          const nextAppLoggingLevel = is_launcher_log_level(preference.appLoggingLevel) ? preference.appLoggingLevel : "off";
          const nextDebugFlagMode = is_debug_flag_mode(preference.debugFlagMode) ? preference.debugFlagMode : "preset";
          const nextLoggingLevel = is_launcher_log_level(preference.loggingLevel) ? preference.loggingLevel : "off";
          const nextWineDebugArgs = typeof preference.wineDebugArgs === "string" ? preference.wineDebugArgs : "";
          const nextShortcuts = normalize_shortcuts(preference.shortcuts);

          setLocale(nextLocale);
          void change_renderer_locale(nextLocale);
          setInstallPath(nextWineInstallPath);
          setBottlePrefixPath(nextBottlePrefixPath);
          setDxmtCachePath(nextDxmtCachePath);
          setGameInstallPath(nextGameInstallPath);
          setCloseToTray(nextCloseToTray);
          setThemeMode(nextThemeMode);
          apply_renderer_theme_mode(nextThemeMode);
          setAppLoggingLevel(nextAppLoggingLevel);
          setDebugFlagMode(nextDebugFlagMode);
          setLoggingLevel(nextLoggingLevel);
          setWineDebugArgs(nextWineDebugArgs);
          setShortcuts(nextShortcuts);
          setAutoUpdateEnabled(nextAutoCheckUpdates);
        }
      } catch {
        if (isMounted) {
          setLocale(resolve_initial_locale());
          setAutoUpdateEnabled(true);
          setInstallPath(DEFAULT_WINE_INSTALL_PATH);
          setBottlePrefixPath(DEFAULT_BOTTLE_PREFIX_PATH);
          setDxmtCachePath(DEFAULT_DXMT_CACHE_PATH);
          setShortcuts(DEFAULT_SHORTCUTS);
        }
      }
    }

    void load_preference();

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    return window.BTIH_API?.on(IPC_CHANNELS.APP.UPDATE_STATUS.channelName, (_event, payload) => {
      setAppUpdateStatus(payload);
    });
  }, []);

  React.useEffect(() => {
    let isMounted = true;

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
  }, []);

  const handle_locale_change = (nextLocale: SupportedLocale) => {
    setLocale(nextLocale);
  };

  const handle_install_path_change = (nextPath: string) => {
    setInstallPath(nextPath);
  };

  const handle_reset_install_path = () => {
    setInstallPath(DEFAULT_WINE_INSTALL_PATH);
    setBottlePrefixPath(DEFAULT_BOTTLE_PREFIX_PATH);
    setDxmtCachePath(DEFAULT_DXMT_CACHE_PATH);
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

  const handle_auto_update_change = (enabled: boolean) => {
    setAutoUpdateEnabled(enabled);
  };

  const handle_shortcut_change = (action: LauncherShortcutAction, shortcut: string) => {
    setShortcuts((currentShortcuts) => ({
      ...currentShortcuts,
      [action]: shortcut,
    }));
  };

  const handle_save_preference = () => {
    void window.BTIH_API?.invoke(IPC_CHANNELS.APP.UPDATE_PREFERENCE.channelName, {
      language: locale,
      wineInstallPath: installPath,
      bottlePrefixPath,
      dxmtCachePath,
      gameInstallPath,
      autoCheckUpdates: autoUpdateEnabled,
      closeToTray,
      themeMode,
      appLoggingLevel,
      debugFlagMode,
      loggingLevel,
      wineDebugArgs,
      shortcuts,
    } as LauncherPreferencePayload);
    void change_renderer_locale(locale);
    apply_renderer_theme_mode(themeMode);
  };

  const handle_check_for_updates = () => {
    window.BTIH_API?.send(IPC_CHANNELS.APP.UPDATE.channelName, undefined as never);
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
      }

      if (should_reset_deleted_target(targets, "dxmtCache")) {
        setDxmtCachePath(DEFAULT_DXMT_CACHE_PATH);
      }

      if (should_reset_deleted_target(targets, "settings")) {
        setAppLoggingLevel("off");
        setDebugFlagMode("preset");
        setLoggingLevel("off");
        setWineDebugArgs("");
      }
    }
  };

  return (
    <div className="min-h-dvh bg-[#0b1020] text-slate-100">
      <PreferenceView
        locale={locale}
        accentColor={accentColor}
        themeMode={themeMode}
        appLoggingLevel={appLoggingLevel}
        debugFlagMode={debugFlagMode}
        loggingLevel={loggingLevel}
        wineDebugArgs={wineDebugArgs}
        shortcuts={shortcuts}
        installPath={installPath}
        bottlePrefixPath={bottlePrefixPath}
        dxmtCachePath={dxmtCachePath}
        autoUpdateEnabled={autoUpdateEnabled}
        appUpdateStatus={appUpdateStatus}
        developerSiteUrl={DEVELOPER_SITE_URL}
        developerGitHubUrl={DEVELOPER_GITHUB_URL}
        developerYouTubeUrl={DEVELOPER_YOUTUBE_URL}
        isDeveloperOnAir={isDeveloperOnAir}
        onLocaleChange={handle_locale_change}
        onAccentColorChange={setAccentColor}
        onThemeModeChange={setThemeMode}
        onAppLoggingLevelChange={setAppLoggingLevel}
        onDebugFlagModeChange={setDebugFlagMode}
        onLoggingLevelChange={setLoggingLevel}
        onWineDebugArgsChange={setWineDebugArgs}
        onShortcutChange={handle_shortcut_change}
        onAutoUpdateEnabledChange={handle_auto_update_change}
        onCheckForUpdates={handle_check_for_updates}
        onInstallPathChange={handle_install_path_change}
        onBottlePrefixPathChange={setBottlePrefixPath}
        onDxmtCachePathChange={setDxmtCachePath}
        onBrowsePath={handle_browse_path}
        onResetPath={handle_reset_path}
        onDeleteLauncherData={(targets) => void handle_delete_launcher_data(targets)}
        onReset={handle_reset_install_path}
        onSave={handle_save_preference}
      />
    </div>
  );
};

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(<App />);
