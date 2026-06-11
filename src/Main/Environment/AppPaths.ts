import { app } from "electron";
import os from "os";
import path from "path";

const TEST_RESOURCE_DIR = "tmp_test_resource";
const PACKAGED_SETTINGS_DIR = path.join(os.homedir(), ".bdih-launcher");
const PACKAGED_APP_DATA_DIR = path.join(os.homedir(), "Library", "Application Support", "BDIH Launcher");

function is_packaged_environment(): boolean {
  return app.isPackaged;
}

function get_dev_resource_root(): string {
  return path.resolve(process.cwd(), TEST_RESOURCE_DIR);
}

function get_dev_prefixed_root(): string {
  return is_packaged_environment() ? PACKAGED_APP_DATA_DIR : get_dev_resource_root();
}

export function get_settings_path(): string {
  if (is_packaged_environment()) {
    return path.join(PACKAGED_SETTINGS_DIR, "settings.json");
  }

  return path.join(get_dev_resource_root(), "settings.json");
}

export function get_legacy_settings_dir(): string {
  return PACKAGED_SETTINGS_DIR;
}

export function get_app_data_root(): string {
  return get_dev_prefixed_root();
}

export function get_default_wine_install_path(): string {
  return path.join(get_dev_prefixed_root(), "Wine");
}

export function get_default_bottle_prefix_path(): string {
  return path.join(get_dev_prefixed_root(), "Bottles");
}

export function get_default_dxmt_cache_path(): string {
  return path.join(get_dev_prefixed_root(), "DXMT");
}

export function get_default_log_dir(): string {
  return path.join(get_dev_prefixed_root(), "logs");
}

export function get_bottle_registry_path(): string {
  return path.join(get_dev_prefixed_root(), "bottles.json");
}
