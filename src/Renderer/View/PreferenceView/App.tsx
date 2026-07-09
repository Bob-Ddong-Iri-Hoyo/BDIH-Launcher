import React from "react";
import { createRoot } from "react-dom/client";
import "../../style/index.css";
import { AppUpdateStatusPayload, DEBUG_FLAG_MODES, DebugFlagMode, DeleteLauncherDataResultPayload, IPC_CHANNELS, LAUNCHER_LOG_LEVELS, LAUNCHER_SHORTCUT_ACTIONS, LauncherDataDeleteTarget, LauncherLogLevel, LauncherPreferencePayload, LauncherShortcutAction, LauncherShortcutMap, RENDERER_THEME_MODES, RendererThemeMode, SelectDirectoryResultPayload, YouTubeLiveStatusPayload } from "../../../Common/Types/IPC";
import { BDIH_GITHUB_URL, BDIH_SITE_URL, BDIH_YOUTUBE_HANDLE, BDIH_YOUTUBE_URL } from "../../../Common/Constant/RuntimeSources";
import { change_renderer_locale, is_supported_locale, resolve_initial_locale, SupportedLocale } from "../../I18n";
import { AccentColor, apply_renderer_accent_color, is_accent_color, resolve_initial_accent_color } from "../../Theme";
import { Box } from "../../Component/Primitives";
import { PreferencePathKey, PreferenceView } from "./PreferenceView";

const DEVELOPER_YOUTUBE_HANDLE = BDIH_YOUTUBE_HANDLE;
const DEVELOPER_SITE_URL = BDIH_SITE_URL;
const DEVELOPER_GITHUB_URL = BDIH_GITHUB_URL;
const DEVELOPER_YOUTUBE_URL = BDIH_YOUTUBE_URL;
const DEFAULT_DATA_ROOT_PATH = "~/Library/Application Support/BDIH Launcher";
const DEFAULT_WINE_INSTALL_PATH = create_data_root_child_path(DEFAULT_DATA_ROOT_PATH, "Wine");
const DEFAULT_BOTTLE_PREFIX_PATH = create_data_root_child_path(DEFAULT_DATA_ROOT_PATH, "Bottles");
const DEFAULT_DXMT_CACHE_PATH = create_data_root_child_path(DEFAULT_DATA_ROOT_PATH, "DXMT");
const DEFAULT_SHORTCUTS: LauncherShortcutMap = {
  launch: "Command + Return",
  logs: "Command + L",
  preferences: "Command + ,",
};

type PreferenceKeyInput = {
  language: SupportedLocale;
  accentColor: AccentColor;
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
};

function create_preference_key(preference: PreferenceKeyInput): string {
  return JSON.stringify(preference);
}

function is_non_empty_string(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function create_data_root_child_path(dataRootPath: string, childName: string): string {
  const trimmedRoot = dataRootPath.trim().replace(/\/+$/, "") || DEFAULT_DATA_ROOT_PATH;

  return `${trimmedRoot}/${childName}`;
}

function derive_storage_paths_from_data_root(dataRootPath: string): {
  installPath: string;
  bottlePrefixPath: string;
  dxmtCachePath: string;
} {
  return {
    installPath: create_data_root_child_path(dataRootPath, "Wine"),
    bottlePrefixPath: create_data_root_child_path(dataRootPath, "Bottles"),
    dxmtCachePath: create_data_root_child_path(dataRootPath, "DXMT"),
  };
}

function normalize_preference_path(value: string): string {
  return value.trim().replace(/\/+$/, "");
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

  const normalizedRoots = [...new Set(roots.map((root) => root.trim().replace(/\/+$/, "")))];

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
  const resolvedTheme = themeMode === "system"
    ? window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
    : themeMode;

  document.documentElement.dataset.themeMode = themeMode;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
}

const App: React.FC = () => {
  const [locale, setLocale] = React.useState<SupportedLocale>(() => resolve_initial_locale());
  const [accentColor, setAccentColor] = React.useState<AccentColor>(() => resolve_initial_accent_color());
  const [themeMode, setThemeMode] = React.useState<RendererThemeMode>("system");
  const [dataRootPath, setDataRootPath] = React.useState(DEFAULT_DATA_ROOT_PATH);
  const [installPath, setInstallPath] = React.useState(DEFAULT_WINE_INSTALL_PATH);
  const [bottlePrefixPath, setBottlePrefixPath] = React.useState(DEFAULT_BOTTLE_PREFIX_PATH);
  const [dxmtCachePath, setDxmtCachePath] = React.useState(DEFAULT_DXMT_CACHE_PATH);
  const [gameInstallPath, setGameInstallPath] = React.useState("");
  const [closeToTray, setCloseToTray] = React.useState(false);
  const [appLoggingLevel, setAppLoggingLevel] = React.useState<LauncherLogLevel>("info");
  const [debugFlagMode, setDebugFlagMode] = React.useState<DebugFlagMode>("preset");
  const [loggingLevel, setLoggingLevel] = React.useState<LauncherLogLevel>("off");
  const [wineDebugArgs, setWineDebugArgs] = React.useState("");
  const [shortcuts, setShortcuts] = React.useState<LauncherShortcutMap>(DEFAULT_SHORTCUTS);
  const [isDeveloperOnAir, setIsDeveloperOnAir] = React.useState(false);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = React.useState(true);
  const [appUpdateStatus, setAppUpdateStatus] = React.useState<AppUpdateStatusPayload>();
  const [savedPreferenceKey, setSavedPreferenceKey] = React.useState("");
  const currentPreferenceKey = React.useMemo(
    () =>
      create_preference_key({
        language: locale,
        accentColor,
        dataRootPath,
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
      }),
    [
      appLoggingLevel,
      accentColor,
      autoUpdateEnabled,
      bottlePrefixPath,
      closeToTray,
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
    ],
  );
  const hasPreferenceChanges = savedPreferenceKey.length > 0 && currentPreferenceKey !== savedPreferenceKey;

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
          const nextAccentColor = is_accent_color(preference.accentColor) ? preference.accentColor : resolve_initial_accent_color();
          const nextAutoCheckUpdates = typeof preference.autoCheckUpdates === "boolean" ? preference.autoCheckUpdates : true;
          const nextDataRootPath = is_non_empty_string(preference.dataRootPath)
            ? preference.dataRootPath
            : infer_data_root_from_storage_paths(
              preference.wineInstallPath,
              preference.bottlePrefixPath,
              preference.dxmtCachePath,
            ) ?? DEFAULT_DATA_ROOT_PATH;
          const nextStoragePaths = derive_storage_paths_from_data_root(nextDataRootPath);
          const nextWineInstallPath = nextStoragePaths.installPath;
          const nextBottlePrefixPath = nextStoragePaths.bottlePrefixPath;
          const nextDxmtCachePath = nextStoragePaths.dxmtCachePath;
          const nextGameInstallPath = is_non_empty_string(preference.gameInstallPath) ? preference.gameInstallPath : "";
          const nextCloseToTray = typeof preference.closeToTray === "boolean" ? preference.closeToTray : false;
          const nextThemeMode = is_renderer_theme_mode(preference.themeMode) ? preference.themeMode : "system";
          const nextAppLoggingLevel = is_launcher_log_level(preference.appLoggingLevel) ? preference.appLoggingLevel : "info";
          const nextDebugFlagMode = is_debug_flag_mode(preference.debugFlagMode) ? preference.debugFlagMode : "preset";
          const nextLoggingLevel = is_launcher_log_level(preference.loggingLevel) ? preference.loggingLevel : "off";
          const nextWineDebugArgs = typeof preference.wineDebugArgs === "string" ? preference.wineDebugArgs : "";
          const nextShortcuts = normalize_shortcuts(preference.shortcuts);

          setLocale(nextLocale);
          void change_renderer_locale(nextLocale);
          setAccentColor(nextAccentColor);
          apply_renderer_accent_color(nextAccentColor);
          setDataRootPath(nextDataRootPath);
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
          setSavedPreferenceKey(create_preference_key({
            language: nextLocale,
            accentColor: nextAccentColor,
            dataRootPath: nextDataRootPath,
            wineInstallPath: nextWineInstallPath,
            bottlePrefixPath: nextBottlePrefixPath,
            dxmtCachePath: nextDxmtCachePath,
            gameInstallPath: nextGameInstallPath,
            autoCheckUpdates: nextAutoCheckUpdates,
            closeToTray: nextCloseToTray,
            themeMode: nextThemeMode,
            appLoggingLevel: nextAppLoggingLevel,
            debugFlagMode: nextDebugFlagMode,
            loggingLevel: nextLoggingLevel,
            wineDebugArgs: nextWineDebugArgs,
            shortcuts: nextShortcuts,
          }));
        }
      } catch {
        if (isMounted) {
          const nextLocale = resolve_initial_locale();
          const nextAccentColor = resolve_initial_accent_color();

          setLocale(nextLocale);
          void change_renderer_locale(nextLocale);
          setAccentColor(nextAccentColor);
          apply_renderer_accent_color(nextAccentColor);
          setAutoUpdateEnabled(true);
          setDataRootPath(DEFAULT_DATA_ROOT_PATH);
          setInstallPath(DEFAULT_WINE_INSTALL_PATH);
          setBottlePrefixPath(DEFAULT_BOTTLE_PREFIX_PATH);
          setDxmtCachePath(DEFAULT_DXMT_CACHE_PATH);
          setShortcuts(DEFAULT_SHORTCUTS);
          setSavedPreferenceKey(create_preference_key({
            language: resolve_initial_locale(),
            accentColor: resolve_initial_accent_color(),
            dataRootPath: DEFAULT_DATA_ROOT_PATH,
            wineInstallPath: DEFAULT_WINE_INSTALL_PATH,
            bottlePrefixPath: DEFAULT_BOTTLE_PREFIX_PATH,
            dxmtCachePath: DEFAULT_DXMT_CACHE_PATH,
            gameInstallPath: "",
            autoCheckUpdates: true,
            closeToTray: false,
            themeMode: "system",
            appLoggingLevel: "info",
            debugFlagMode: "preset",
            loggingLevel: "off",
            wineDebugArgs: "",
            shortcuts: DEFAULT_SHORTCUTS,
          }));
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

  const handle_data_root_path_change = (nextPath: string) => {
    const nextStoragePaths = derive_storage_paths_from_data_root(nextPath);
    const currentDefaultBottlePrefixPath = derive_storage_paths_from_data_root(dataRootPath).bottlePrefixPath;
    const usesCustomBottlePrefixPath = normalize_preference_path(bottlePrefixPath) !== normalize_preference_path(currentDefaultBottlePrefixPath);

    setDataRootPath(nextPath);
    setInstallPath(nextStoragePaths.installPath);
    setBottlePrefixPath(usesCustomBottlePrefixPath ? bottlePrefixPath : nextStoragePaths.bottlePrefixPath);
    setDxmtCachePath(nextStoragePaths.dxmtCachePath);
  };

  const handle_reset_path = (pathKey: PreferencePathKey) => {
    if (pathKey === "dataRootPath") {
      handle_data_root_path_change(DEFAULT_DATA_ROOT_PATH);
      return;
    }

    if (pathKey === "bottlePrefixPath") {
      setBottlePrefixPath(derive_storage_paths_from_data_root(dataRootPath).bottlePrefixPath);
    }
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

    handle_data_root_path_change(result.path);
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
    const nextPreference = {
      language: locale,
      accentColor,
      dataRootPath,
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
    } as LauncherPreferencePayload;

    void window.BTIH_API?.invoke(IPC_CHANNELS.APP.UPDATE_PREFERENCE.channelName, nextPreference);
    setSavedPreferenceKey(currentPreferenceKey);
    void change_renderer_locale(locale);
    apply_renderer_accent_color(accentColor);
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
      dataRootPath,
      wineInstallPath: installPath,
      bottlePrefixPath,
      dxmtCachePath,
    })) as DeleteLauncherDataResultPayload | undefined;

    if (!result || result.failedPaths.length === 0) {
      if (should_reset_deleted_target(targets, "settings")) {
        const nextPreferenceKey = create_preference_key({
          language: resolve_initial_locale(),
          accentColor: resolve_initial_accent_color(),
          dataRootPath: DEFAULT_DATA_ROOT_PATH,
          wineInstallPath: DEFAULT_WINE_INSTALL_PATH,
          bottlePrefixPath: DEFAULT_BOTTLE_PREFIX_PATH,
          dxmtCachePath: DEFAULT_DXMT_CACHE_PATH,
          gameInstallPath: "",
          autoCheckUpdates: true,
          closeToTray: false,
          themeMode: "system",
          appLoggingLevel: "info",
          debugFlagMode: "preset",
          loggingLevel: "off",
          wineDebugArgs: "",
          shortcuts: DEFAULT_SHORTCUTS,
        });

        setLocale(resolve_initial_locale());
        setAccentColor(resolve_initial_accent_color());
        apply_renderer_accent_color(resolve_initial_accent_color());
        setDataRootPath(DEFAULT_DATA_ROOT_PATH);
        setInstallPath(DEFAULT_WINE_INSTALL_PATH);
        setBottlePrefixPath(DEFAULT_BOTTLE_PREFIX_PATH);
        setDxmtCachePath(DEFAULT_DXMT_CACHE_PATH);
        setThemeMode("system");
        setAppLoggingLevel("off");
        setDebugFlagMode("preset");
        setLoggingLevel("off");
        setWineDebugArgs("");
        setShortcuts(DEFAULT_SHORTCUTS);
        setAutoUpdateEnabled(true);
        setSavedPreferenceKey(nextPreferenceKey);
      }
    }

    return result;
  };

  return (
    <Box className="h-dvh overflow-hidden bg-[#0b1020] text-slate-100">
      <PreferenceView
        locale={locale}
        accentColor={accentColor}
        themeMode={themeMode}
        appLoggingLevel={appLoggingLevel}
        debugFlagMode={debugFlagMode}
        loggingLevel={loggingLevel}
        wineDebugArgs={wineDebugArgs}
        shortcuts={shortcuts}
        dataRootPath={dataRootPath}
        installPath={installPath}
        bottlePrefixPath={bottlePrefixPath}
        dxmtCachePath={dxmtCachePath}
        autoUpdateEnabled={autoUpdateEnabled}
        closeToTray={closeToTray}
        appUpdateStatus={appUpdateStatus}
        initialHasChanges={hasPreferenceChanges}
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
        onCloseToTrayChange={setCloseToTray}
        onCheckForUpdates={handle_check_for_updates}
        onDataRootPathChange={handle_data_root_path_change}
        onInstallPathChange={setInstallPath}
        onBottlePrefixPathChange={setBottlePrefixPath}
        onDxmtCachePathChange={setDxmtCachePath}
        onBrowsePath={handle_browse_path}
        onResetPath={handle_reset_path}
        onDeleteLauncherData={handle_delete_launcher_data}
        onSave={handle_save_preference}
      />
    </Box>
  );
};

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(<App />);
