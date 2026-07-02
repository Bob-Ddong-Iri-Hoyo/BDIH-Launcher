import electron from "electron";
import os from "os";
import path from "path";

const TEST_RESOURCE_DIR = "tmp_test_resource";
const CURRENT_APP_DATA_DIR_NAME = "BDIH Launcher";
const LEGACY_APP_DATA_DIR_NAMES = [CURRENT_APP_DATA_DIR_NAME, "BDIH"];
const APP_META_FILE_NAME = "appmeta.json";
const LEGACY_BOTTLE_REGISTRY_FILE_NAME = "bottles.json";
const ENV_IS_PACKAGED = "BDIH_IS_PACKAGED";
const ENV_DEV_RESOURCE_ROOT = "BDIH_DEV_RESOURCE_ROOT";
const ENV_SETTINGS_DIR = "BDIH_SETTINGS_DIR";
const ENV_APP_DATA_ROOT = "BDIH_APP_DATA_ROOT";
const ENV_LEGACY_APP_DATA_ROOT = "BDIH_LEGACY_APP_DATA_ROOT";

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

function env_path(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value ? path.resolve(value) : undefined;
}

function get_dev_resource_root(): string {
  return env_path(ENV_DEV_RESOURCE_ROOT) ?? path.resolve(process.cwd(), TEST_RESOURCE_DIR);
}

function get_packaged_settings_dir(): string {
  return env_path(ENV_SETTINGS_DIR) ?? path.join(os.homedir(), ".bdih-launcher");
}

function get_packaged_app_data_root(): string {
  return env_path(ENV_APP_DATA_ROOT) ?? path.join(os.homedir(), "Library", "Application Support", CURRENT_APP_DATA_DIR_NAME);
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
  const override = env_path(ENV_LEGACY_APP_DATA_ROOT);

  if (override) {
    return [override];
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
  return dataRootPath ? path.resolve(expand_user_home_path(dataRootPath)) : get_dev_prefixed_root();
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
