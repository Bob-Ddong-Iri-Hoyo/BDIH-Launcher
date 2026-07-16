import { backupInvalidUserSettings, readConfigFile, readUserSettings, writeUserSettings } from "../FileIO/IO";
import { DEBUG_FLAG_MODES, DebugFlagMode, LAUNCHER_LOG_LEVELS, LAUNCHER_PUBLIC_UPDATE_CHANNELS, LAUNCHER_SHORTCUT_ACTIONS, LAUNCHER_WINDOW_DEFAULT_SIZE, LAUNCHER_WINDOW_MIN_SIZE, LAUNCHER_WINDOW_STARTUP_SIZE_MODES, LauncherLogLevel, LauncherPreferencePayload, LauncherShortcutMap, LauncherUpdateChannel, LauncherWindowStartupSizeMode, RENDERER_THEME_MODES, RendererThemeMode } from "../../Common/Types/IPC";
import path from "path";
import {
  get_default_data_root_path,
  get_default_bottle_prefix_path,
  get_default_dxmt_cache_path,
  get_default_wine_install_path,
  get_legacy_settings_path,
  constrain_update_test_data_path,
  is_dev_resource_environment,
  is_nightly_update_test_build,
  is_update_test_build,
} from "../Environment/AppPaths";

export type LauncherPreference = LauncherPreferencePayload;

const DEFAULT_DATA_ROOT_PATH = get_default_data_root_path();
const DEFAULT_WINE_INSTALL_PATH = get_default_wine_install_path();
const DEFAULT_BOTTLE_PREFIX_PATH = get_default_bottle_prefix_path();
const DEFAULT_DXMT_CACHE_PATH = get_default_dxmt_cache_path();
const DEFAULT_SHORTCUTS: LauncherShortcutMap = {
  launch: "Command + Return",
  logs: "Command + L",
  preferences: "Command + ,",
  logFind: "Command + F",
  logFindNext: "Command + N",
  logFindPrevious: "Command + P",
};
const ACCENT_COLORS = ["rose", "sky", "emerald", "violet", "amber"] as const;
type AccentColorPreference = (typeof ACCENT_COLORS)[number];

export const DEFAULT_LAUNCHER_PREFERENCE: LauncherPreference = {
  language: "ko",
  accentColor: "rose",
  dataRootPath: DEFAULT_DATA_ROOT_PATH,
  wineInstallPath: DEFAULT_WINE_INSTALL_PATH,
  bottlePrefixPath: DEFAULT_BOTTLE_PREFIX_PATH,
  dxmtCachePath: DEFAULT_DXMT_CACHE_PATH,
  gameInstallPath: path.join(DEFAULT_DATA_ROOT_PATH, "Games"),
  autoCheckUpdates: !is_update_test_build(),
  updateChannel: is_nightly_update_test_build() ? "nightly" : "stable",
  closeToTray: false,
  windowStartupSizeMode: "default",
  windowStartupCustomWidth: LAUNCHER_WINDOW_DEFAULT_SIZE.width,
  windowStartupCustomHeight: LAUNCHER_WINDOW_DEFAULT_SIZE.height,
  themeMode: "system",
  appLoggingLevel: "info",
  debugFlagMode: "preset",
  loggingLevel: "off",
  wineDebugArgs: "",
  shortcuts: DEFAULT_SHORTCUTS,
};

/**
 * Reads and writes launcher preferences.
 *
 * Preference values are cached because many managers need paths during IPC
 * calls. Any operation that deletes or rewrites settings must clear this cache
 * before the renderer asks for fresh values.
 */
export class PreferenceManager {
  private cache: LauncherPreference | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();

  async getPreference(forceReload = false): Promise<LauncherPreference> {
    // `forceReload` bypasses the in-memory cache when callers know settings may
    // have changed outside PreferenceManager.
    if (this.cache && !forceReload) {
      return this.cache;
    }

    this.cache = await this.loadPreference();
    return this.cache;
  }

  async savePreference(preference: LauncherPreference): Promise<void> {
    await this.enqueueWrite(async () => {
      const normalized = this.normalizePreference(preference);
      await writeUserSettings(JSON.stringify(normalized, null, 2));
      this.cache = normalized;
    });
  }

  async updatePreference(
    patch: Partial<LauncherPreference>,
  ): Promise<LauncherPreference> {
    return this.enqueueWrite(async () => {
      const current = this.cache ?? await this.loadPreference();
      const next = this.normalizePreference({ ...current, ...patch });
      await writeUserSettings(JSON.stringify(next, null, 2));
      this.cache = next;
      return next;
    });
  }

  async flushPendingWrites(): Promise<void> {
    await this.pendingWrite;
  }

  clearCache(): void {
    this.cache = null;
  }

  private async loadPreference(): Promise<LauncherPreference> {
    try {
      const data = await readUserSettings();
      return this.normalizePreference(JSON.parse(data));
    } catch (error) {
      if (this.isMissingFileError(error)) {
        const legacyPreference = await this.loadLegacyPreference();

        if (legacyPreference) {
          return legacyPreference;
        }

        return DEFAULT_LAUNCHER_PREFERENCE;
      }

      if (error instanceof SyntaxError) {
        const backupPath = await backupInvalidUserSettings();
        console.warn(
          `Invalid launcher settings were moved aside${backupPath ? ` to ${backupPath}` : ""}. Using defaults.`,
        );
        return DEFAULT_LAUNCHER_PREFERENCE;
      }

      throw error;
    }
  }

  private async loadLegacyPreference(): Promise<LauncherPreference | null> {
    if (!is_dev_resource_environment()) {
      return null;
    }

    try {
      const data = await readConfigFile(get_legacy_settings_path());
      return this.normalizePreference(JSON.parse(data));
    } catch (error) {
      if (this.isMissingFileError(error)) {
        return null;
      }

      throw error;
    }
  }

  private normalizePreference(value: unknown): LauncherPreference {
    const record = this.isRecord(value) ? value : {};
    const dataRootPath = constrain_update_test_data_path(
      this.stringOrDefault(record.dataRootPath, this.inferDataRootPath(record) ?? DEFAULT_DATA_ROOT_PATH),
      DEFAULT_DATA_ROOT_PATH,
    );
    const bottlePrefixPath = constrain_update_test_data_path(
      this.stringOrDefault(record.bottlePrefixPath, get_default_bottle_prefix_path(dataRootPath)),
      get_default_bottle_prefix_path(dataRootPath),
    );
    const gameInstallPath = constrain_update_test_data_path(
      this.stringOrDefault(record.gameInstallPath, path.join(dataRootPath, "Games")),
      path.join(dataRootPath, "Games"),
    );

    return {
      language: this.stringOrDefault(record.language, "ko"),
      accentColor: this.accentColorOrDefault(record.accentColor, "rose"),
      dataRootPath,
      wineInstallPath: get_default_wine_install_path(dataRootPath),
      bottlePrefixPath,
      dxmtCachePath: get_default_dxmt_cache_path(dataRootPath),
      gameInstallPath,
      autoCheckUpdates: this.booleanOrDefault(record.autoCheckUpdates, !is_update_test_build()),
      updateChannel: is_nightly_update_test_build()
        ? "nightly"
        : this.updateChannelOrDefault(record.updateChannel, "stable"),
      closeToTray: this.booleanOrDefault(record.closeToTray, false),
      windowStartupSizeMode: this.windowStartupSizeModeOrDefault(record.windowStartupSizeMode, "default"),
      windowStartupCustomWidth: this.integerOrDefault(
        record.windowStartupCustomWidth,
        LAUNCHER_WINDOW_DEFAULT_SIZE.width,
        LAUNCHER_WINDOW_MIN_SIZE.width,
      ),
      windowStartupCustomHeight: this.integerOrDefault(
        record.windowStartupCustomHeight,
        LAUNCHER_WINDOW_DEFAULT_SIZE.height,
        LAUNCHER_WINDOW_MIN_SIZE.height,
      ),
      lastWindowWidth: this.optionalInteger(record.lastWindowWidth, LAUNCHER_WINDOW_MIN_SIZE.width),
      lastWindowHeight: this.optionalInteger(record.lastWindowHeight, LAUNCHER_WINDOW_MIN_SIZE.height),
      lastWindowMaximized: this.booleanOrDefault(record.lastWindowMaximized, false),
      lastWindowFullscreen: this.booleanOrDefault(record.lastWindowFullscreen, false),
      themeMode: this.themeModeOrDefault(record.themeMode, "system"),
      appLoggingLevel: this.loggingLevelOrDefault(record.appLoggingLevel, "info"),
      debugFlagMode: this.debugFlagModeOrDefault(record.debugFlagMode, "preset"),
      loggingLevel: this.loggingLevelOrDefault(record.loggingLevel, "off"),
      wineDebugArgs: this.stringOrDefault(record.wineDebugArgs, ""),
      shortcuts: this.shortcutsOrDefault(record.shortcuts),
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pendingWrite.then(operation);

    this.pendingWrite = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  private stringOrDefault(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  private booleanOrDefault(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
  }

  private integerOrDefault(value: unknown, fallback: number, minimum: number): number {
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(minimum, Math.round(value))
      : fallback;
  }

  private optionalInteger(value: unknown, minimum: number): number | undefined {
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(minimum, Math.round(value))
      : undefined;
  }

  private windowStartupSizeModeOrDefault(
    value: unknown,
    fallback: LauncherWindowStartupSizeMode,
  ): LauncherWindowStartupSizeMode {
    // Migrate the early implementation that used native full-screen mode.
    if (value === "fullscreen") {
      return "maximized";
    }

    return typeof value === "string"
      && LAUNCHER_WINDOW_STARTUP_SIZE_MODES.includes(value as LauncherWindowStartupSizeMode)
      ? (value as LauncherWindowStartupSizeMode)
      : fallback;
  }

  private loggingLevelOrDefault(value: unknown, fallback: LauncherLogLevel): LauncherLogLevel {
    return typeof value === "string" && LAUNCHER_LOG_LEVELS.includes(value as LauncherLogLevel)
      ? (value as LauncherLogLevel)
      : fallback;
  }

  private debugFlagModeOrDefault(value: unknown, fallback: DebugFlagMode): DebugFlagMode {
    return typeof value === "string" && DEBUG_FLAG_MODES.includes(value as DebugFlagMode)
      ? (value as DebugFlagMode)
      : fallback;
  }

  private themeModeOrDefault(value: unknown, fallback: RendererThemeMode): RendererThemeMode {
    return typeof value === "string" && RENDERER_THEME_MODES.includes(value as RendererThemeMode)
      ? (value as RendererThemeMode)
      : fallback;
  }

  private updateChannelOrDefault(value: unknown, fallback: LauncherUpdateChannel): LauncherUpdateChannel {
    return typeof value === "string" && LAUNCHER_PUBLIC_UPDATE_CHANNELS.some((channel) => channel === value)
      ? (value as LauncherUpdateChannel)
      : fallback;
  }

  private accentColorOrDefault(value: unknown, fallback: AccentColorPreference): AccentColorPreference {
    return typeof value === "string" && ACCENT_COLORS.includes(value as AccentColorPreference)
      ? (value as AccentColorPreference)
      : fallback;
  }

  private shortcutsOrDefault(value: unknown): LauncherShortcutMap {
    const record = this.isRecord(value) ? value : {};

    return LAUNCHER_SHORTCUT_ACTIONS.reduce<LauncherShortcutMap>((shortcuts, action) => {
      shortcuts[action] = this.stringOrDefault(record[action], DEFAULT_SHORTCUTS[action]);
      return shortcuts;
    }, { ...DEFAULT_SHORTCUTS });
  }

  private inferDataRootPath(record: Record<string, unknown>): string | undefined {
    const roots = [
      this.parentPathIfNamed(record.wineInstallPath, "Wine"),
      this.parentPathIfNamed(record.bottlePrefixPath, "Bottles"),
      this.parentPathIfNamed(record.dxmtCachePath, "DXMT"),
    ].filter((candidate): candidate is string => Boolean(candidate));

    if (roots.length === 0) {
      return undefined;
    }

    const normalizedRoots = [...new Set(roots.map((root) => root.replace(/\/+$/, "")))];

    return normalizedRoots.length === 1 ? normalizedRoots[0] : undefined;
  }

  private parentPathIfNamed(value: unknown, expectedName: string): string | undefined {
    if (typeof value !== "string" || value.trim().length === 0) {
      return undefined;
    }

    const trimmed = value.trim().replace(/\/+$/, "");

    return path.basename(trimmed) === expectedName ? path.dirname(trimmed) : undefined;
  }

  private isMissingFileError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    );
  }
}

export const preferenceManager = new PreferenceManager();
