import electron from "electron";
import { existsSync, readFileSync, realpathSync } from "fs";
import os from "os";
import path from "path";

const TEST_RESOURCE_DIR = "tmp_test_resource";
const CURRENT_APP_DATA_DIR_NAME = "BDIH Launcher";
const NIGHTLY_APP_DATA_DIR_NAME = "BDIH Launcher Nightly";
const STAGING_APP_DATA_DIR_NAME = "BDIH Launcher Staging";
const UPDATE_TEST_MARKER_FILE_NAME = "bdih-update-test.json";
const NIGHTLY_UPDATE_TEST_MARKER_FILE_NAME = "bdih-nightly-update-test.json";
const NIGHTLY_BUILD_MARKER_FILE_NAME = "bdih-nightly-build.json";
const STAGING_BUILD_MARKER_FILE_NAME = "bdih-staging-build.json";
const UPDATE_TEST_RELEASE_DIR_NAME = "Release";
const UPDATE_TEST_PARENT_DIR_NAME = "tests";
const UPDATE_TEST_STATE_DIR_NAME = "state";
const UPDATE_TEST_SHARED_PROFILE = "stable-beta";
const UPDATE_TEST_NIGHTLY_PROFILE = "nightly";
const LEGACY_APP_DATA_DIR_NAMES = [CURRENT_APP_DATA_DIR_NAME, "BDIH"];
const APP_META_FILE_NAME = "appmeta.json";
const CHANNEL_TRANSITION_STATE_FILE_NAME = "channel-transition.json";
const SNAPSHOT_DIR_NAME = "Snapshots";
const LEGACY_BOTTLE_REGISTRY_FILE_NAME = "bottles.json";
const ENV_IS_PACKAGED = "BDIH_IS_PACKAGED";
const ENV_DEV_RESOURCE_ROOT = "BDIH_DEV_RESOURCE_ROOT";
const ENV_SETTINGS_DIR = "BDIH_SETTINGS_DIR";
const ENV_APP_DATA_ROOT = "BDIH_APP_DATA_ROOT";
const ENV_LEGACY_APP_DATA_ROOT = "BDIH_LEGACY_APP_DATA_ROOT";
const ENV_UPDATE_TEST_BUILD = "BDIH_UPDATE_TEST_BUILD";
const ENV_UPDATE_TEST_ROOT = "BDIH_UPDATE_TEST_ROOT";
const ENV_RELEASE_CHANNEL = "BDIH_RELEASE_CHANNEL";
const ENV_STAGING_BUILD = "BDIH_STAGING_BUILD";
const ENV_STAGING_CHANNEL = "BDIH_STAGING_CHANNEL";

export type StagingUpdateChannel = "stable" | "beta";

export interface UpdateTestRuntimePaths {
  releaseRoot: string;
  stateRoot: string;
  settingsDir: string;
  appDataRoot: string;
  homeRoot: string;
  appDataPathRoot: string;
  userDataRoot: string;
  sessionDataRoot: string;
  electronLogsRoot: string;
  crashDumpsRoot: string;
  tempRoot: string;
  desktopRoot: string;
  documentsRoot: string;
  downloadsRoot: string;
  musicRoot: string;
  picturesRoot: string;
  videosRoot: string;
  updaterCacheRoot: string;
}

type ElectronLike = {
  app?: {
    isPackaged?: boolean;
  };
};

export function is_packaged_environment(): boolean {
  const override = process.env[ENV_IS_PACKAGED]?.trim().toLowerCase();

  if (override === "true" || override === "1") {
    return true;
  }

  if (override === "false" || override === "0") {
    return false;
  }

  return Boolean((electron as unknown as ElectronLike).app?.isPackaged);
}

export function is_dev_resource_environment(): boolean {
  return !is_packaged_environment();
}

function env_flag_is_enabled(name: string): boolean {
  const override = process.env[name]?.trim().toLowerCase();

  return override === "true" || override === "1";
}

export function is_update_test_build(): boolean {
  if (env_flag_is_enabled(ENV_UPDATE_TEST_BUILD)) {
    return true;
  }

  if (!is_packaged_environment() || typeof process.resourcesPath !== "string") {
    return false;
  }

  return existsSync(path.join(process.resourcesPath, UPDATE_TEST_MARKER_FILE_NAME))
    || existsSync(path.join(process.resourcesPath, NIGHTLY_UPDATE_TEST_MARKER_FILE_NAME));
}

export function is_nightly_update_test_build(): boolean {
  if (env_flag_is_enabled(ENV_UPDATE_TEST_BUILD)) {
    return process.env.BDIH_TEST_CHANNEL === "nightly";
  }

  return is_packaged_environment()
    && typeof process.resourcesPath === "string"
    && existsSync(path.join(process.resourcesPath, NIGHTLY_UPDATE_TEST_MARKER_FILE_NAME));
}

export function is_nightly_launcher_build(): boolean {
  if (is_nightly_update_test_build()) {
    return true;
  }

  if (process.env[ENV_RELEASE_CHANNEL]?.trim().toLowerCase() === "nightly") {
    return true;
  }

  return is_packaged_environment()
    && typeof process.resourcesPath === "string"
    && existsSync(path.join(process.resourcesPath, NIGHTLY_BUILD_MARKER_FILE_NAME));
}

export function is_staging_launcher_build(): boolean {
  if (env_flag_is_enabled(ENV_STAGING_BUILD)) {
    return true;
  }

  return is_packaged_environment()
    && typeof process.resourcesPath === "string"
    && existsSync(path.join(process.resourcesPath, STAGING_BUILD_MARKER_FILE_NAME));
}

export function get_staging_update_channel(): StagingUpdateChannel | undefined {
  const environmentChannel = process.env[ENV_STAGING_CHANNEL]?.trim().toLowerCase();

  if (environmentChannel === "stable" || environmentChannel === "beta") {
    return environmentChannel;
  }

  if (!is_staging_launcher_build() || typeof process.resourcesPath !== "string") {
    return undefined;
  }

  try {
    const marker = JSON.parse(
      readFileSync(path.join(process.resourcesPath, STAGING_BUILD_MARKER_FILE_NAME), "utf8"),
    ) as { channel?: unknown };

    return marker.channel === "beta" ? "beta" : "stable";
  } catch {
    return "stable";
  }
}

function env_path(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value ? path.resolve(value) : undefined;
}

function get_dev_resource_root(): string {
  return env_path(ENV_DEV_RESOURCE_ROOT) ?? path.resolve(process.cwd(), TEST_RESOURCE_DIR);
}

function find_update_test_release_root(startPath: string): string | undefined {
  let currentPath = path.resolve(startPath);

  while (true) {
    if (
      path.basename(currentPath) === UPDATE_TEST_RELEASE_DIR_NAME
      && path.basename(path.dirname(currentPath)) === UPDATE_TEST_PARENT_DIR_NAME
    ) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);

    if (parentPath === currentPath) {
      return undefined;
    }

    currentPath = parentPath;
  }
}

function get_update_test_release_root(): string {
  const override = env_path(ENV_UPDATE_TEST_ROOT);

  if (override) {
    return override;
  }

  const releaseRoot = find_update_test_release_root(process.resourcesPath);

  if (!releaseRoot) {
    throw new Error(
      "Update test apps must run from this repository's tests/Release directory. "
      + "Install the Finder test app with the provided pnpm test command.",
    );
  }

  return releaseRoot;
}

export function get_update_test_runtime_paths(): UpdateTestRuntimePaths {
  if (!is_update_test_build()) {
    throw new Error("Update-test runtime paths are only available to update-test builds.");
  }

  const releaseRoot = get_update_test_release_root();
  const profile = is_nightly_update_test_build()
    ? UPDATE_TEST_NIGHTLY_PROFILE
    : UPDATE_TEST_SHARED_PROFILE;
  const stateRoot = path.join(releaseRoot, UPDATE_TEST_STATE_DIR_NAME, profile);
  const homeRoot = path.join(stateRoot, "home");
  const electronRoot = path.join(stateRoot, "electron");

  return {
    releaseRoot,
    stateRoot,
    settingsDir: path.join(stateRoot, "settings"),
    appDataRoot: path.join(stateRoot, "data"),
    homeRoot,
    appDataPathRoot: path.join(electronRoot, "app-data"),
    userDataRoot: path.join(electronRoot, "user-data"),
    sessionDataRoot: path.join(electronRoot, "session-data"),
    electronLogsRoot: path.join(electronRoot, "logs"),
    crashDumpsRoot: path.join(electronRoot, "crash-dumps"),
    tempRoot: path.join(stateRoot, "temp"),
    desktopRoot: path.join(homeRoot, "Desktop"),
    documentsRoot: path.join(homeRoot, "Documents"),
    downloadsRoot: path.join(homeRoot, "Downloads"),
    musicRoot: path.join(homeRoot, "Music"),
    picturesRoot: path.join(homeRoot, "Pictures"),
    videosRoot: path.join(homeRoot, "Movies"),
    updaterCacheRoot: path.join(homeRoot, "Library", "Caches"),
  };
}

function get_packaged_settings_dir(): string {
  if (is_update_test_build()) {
    return get_update_test_runtime_paths().settingsDir;
  }

  const settingsDirName = is_nightly_launcher_build()
    ? ".bdih-launcher-nightly"
    : is_staging_launcher_build()
      ? ".bdih-launcher-staging"
      : ".bdih-launcher";

  return env_path(ENV_SETTINGS_DIR) ?? path.join(os.homedir(), settingsDirName);
}

function get_packaged_app_data_root(): string {
  if (is_update_test_build()) {
    return get_update_test_runtime_paths().appDataRoot;
  }

  return env_path(ENV_APP_DATA_ROOT) ?? path.join(
    os.homedir(),
    "Library",
    "Application Support",
    is_nightly_launcher_build()
      ? NIGHTLY_APP_DATA_DIR_NAME
      : is_staging_launcher_build()
        ? STAGING_APP_DATA_DIR_NAME
        : CURRENT_APP_DATA_DIR_NAME,
  );
}

function get_dev_prefixed_root(): string {
  return is_packaged_environment() ? get_packaged_app_data_root() : get_dev_resource_root();
}

export function get_settings_path(): string {
  if (is_packaged_environment()) {
    return path.join(get_packaged_settings_dir(), "settings.json");
  }

  return path.join(get_dev_resource_root(), "settings.json");
}

export function get_channel_transition_state_path(): string {
  return path.join(path.dirname(get_settings_path()), CHANNEL_TRANSITION_STATE_FILE_NAME);
}

export function get_legacy_settings_path(): string {
  return path.join(get_packaged_settings_dir(), "settings.json");
}

export function get_legacy_settings_dir(): string {
  return get_packaged_settings_dir();
}

export function get_app_data_root(): string {
  return get_dev_prefixed_root();
}

export function get_default_data_root_path(): string {
  return get_dev_prefixed_root();
}

export function get_legacy_app_data_roots(): string[] {
  if (is_update_test_build()) {
    return [get_packaged_app_data_root()];
  }

  const override = env_path(ENV_LEGACY_APP_DATA_ROOT);

  if (override) {
    return [override];
  }

  if (is_nightly_launcher_build() || is_staging_launcher_build()) {
    return [get_packaged_app_data_root()];
  }

  return unique_paths([
    get_packaged_app_data_root(),
    ...LEGACY_APP_DATA_DIR_NAMES.map((dirName) =>
      path.join(os.homedir(), "Library", "Application Support", dirName),
    ),
  ]);
}

export function get_default_wine_install_path(dataRootPath?: string): string {
  return path.join(resolve_data_root_path(dataRootPath), "Wine");
}

export function get_default_bottle_prefix_path(dataRootPath?: string): string {
  return path.join(resolve_data_root_path(dataRootPath), "Bottles");
}

export function get_default_dxmt_cache_path(dataRootPath?: string): string {
  return path.join(resolve_data_root_path(dataRootPath), "DXMT");
}

export function get_default_log_dir(dataRootPath?: string): string {
  return path.join(resolve_data_root_path(dataRootPath), "logs");
}

export function get_default_icon_cache_path(): string {
  return path.join(get_dev_prefixed_root(), "IconCache");
}

export function get_bottle_registry_path(dataRootPath?: string): string {
  return path.join(resolve_data_root_path(dataRootPath), APP_META_FILE_NAME);
}

export function get_snapshot_root_path(dataRootPath?: string): string {
  return path.join(resolve_data_root_path(dataRootPath), SNAPSHOT_DIR_NAME);
}

export function get_legacy_bottle_registry_paths(): string[] {
  return unique_paths([
    path.join(get_dev_prefixed_root(), LEGACY_BOTTLE_REGISTRY_FILE_NAME),
    ...get_legacy_app_data_roots().flatMap((root) => [
      path.join(root, APP_META_FILE_NAME),
      path.join(root, LEGACY_BOTTLE_REGISTRY_FILE_NAME),
    ]),
  ]);
}

export function get_legacy_bottle_prefix_paths(): string[] {
  return get_legacy_app_data_roots().map((root) => path.join(root, "Bottles"));
}

function unique_paths(paths: string[]): string[] {
  return [...new Set(paths.map((targetPath) => path.resolve(targetPath)))];
}

function resolve_data_root_path(dataRootPath?: string): string {
  const resolvedPath = dataRootPath ? path.resolve(expand_user_home_path(dataRootPath)) : get_dev_prefixed_root();

  if (is_update_test_build()) {
    const testRoot = path.resolve(get_packaged_app_data_root());
    if (!path_is_within_root(testRoot, resolvedPath)) {
      throw new Error(`Update test builds cannot access data outside ${testRoot}: ${resolvedPath}`);
    }
  }

  return resolvedPath;
}

export function constrain_update_test_data_path(targetPath: string, fallbackPath: string): string {
  if (!is_update_test_build()) {
    return targetPath;
  }

  try {
    return resolve_data_root_path(targetPath);
  } catch {
    return resolve_data_root_path(fallbackPath);
  }
}

function path_is_within_root(rootPath: string, targetPath: string): boolean {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);
  const relativePath = path.relative(resolvedRoot, resolvedTarget);
  const isLexicallyContained = relativePath === ""
    || (relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath));

  if (!isLexicallyContained || !existsSync(resolvedRoot)) {
    return isLexicallyContained;
  }

  const canonicalRoot = realpathSync(resolvedRoot);
  let currentPath = resolvedRoot;

  for (const segment of relativePath.split(path.sep).filter(Boolean)) {
    currentPath = path.join(currentPath, segment);

    if (!existsSync(currentPath)) {
      break;
    }

    const canonicalPath = realpathSync(currentPath);
    const canonicalRelativePath = path.relative(canonicalRoot, canonicalPath);

    if (
      canonicalRelativePath === ".."
      || canonicalRelativePath.startsWith(`..${path.sep}`)
      || path.isAbsolute(canonicalRelativePath)
    ) {
      return false;
    }
  }

  return true;
}

function expand_user_home_path(targetPath: string): string {
  if (targetPath === "~") {
    return os.homedir();
  }

  if (targetPath.startsWith("~/")) {
    return path.join(os.homedir(), targetPath.slice(2));
  }

  return targetPath;
}
