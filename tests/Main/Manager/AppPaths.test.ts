import { jest } from "@jest/globals";
import { mkdir, symlink } from "fs/promises";
import os from "os";
import path from "path";
import {
  capture_manager_environment,
  create_manager_fixture_environment,
  ManagerFixtureEnvironment,
  remove_manager_fixture_environment,
  restore_manager_environment,
} from "../../fixtures/managerFixtures";

describe("AppPaths", () => {
  let environment: ManagerFixtureEnvironment;
  let environmentSnapshot: ReturnType<typeof capture_manager_environment>;

  beforeEach(async () => {
    environmentSnapshot = capture_manager_environment();
    environment = await create_manager_fixture_environment();
    jest.resetModules();
  });

  afterEach(async () => {
    restore_manager_environment(environmentSnapshot);
    await remove_manager_fixture_environment(environment);
    jest.resetModules();
  });

  it("routes dev resources into the fixture resource root while keeping legacy paths readable", async () => {
    const {
      get_default_bottle_prefix_path,
      get_channel_transition_state_path,
      get_legacy_bottle_prefix_paths,
      get_snapshot_root_path,
      get_legacy_settings_path,
      get_settings_path,
      is_dev_resource_environment,
    } = require("../../../src/Main/Environment/AppPaths") as typeof import("../../../src/Main/Environment/AppPaths");

    expect(is_dev_resource_environment()).toBe(true);
    expect(get_settings_path()).toBe(environment.devSettingsPath);
    expect(get_channel_transition_state_path()).toBe(path.join(environment.devResourceRoot, "channel-transition.json"));
    expect(get_default_bottle_prefix_path()).toBe(path.join(environment.devResourceRoot, "Bottles"));
    expect(get_snapshot_root_path()).toBe(path.join(environment.devResourceRoot, "Snapshots"));
    expect(get_legacy_settings_path()).toBe(environment.legacySettingsPath);
    expect(get_legacy_bottle_prefix_paths()).toEqual([environment.legacyBottlePrefixRoot]);
  });

  it.each([
    ["stable", "stable-beta"],
    ["beta", "stable-beta"],
    ["nightly", "nightly"],
  ])("isolates %s update-test state below tests/Release/state/%s", async (channel, profile) => {
    const releaseRoot = path.join(environment.root, "tests", "Release");
    process.env.BDIH_IS_PACKAGED = "true";
    process.env.BDIH_UPDATE_TEST_BUILD = "1";
    process.env.BDIH_UPDATE_TEST_ROOT = releaseRoot;
    process.env.BDIH_TEST_CHANNEL = channel;
    jest.resetModules();

    const {
      get_app_data_root,
      get_channel_transition_state_path,
      get_default_bottle_prefix_path,
      get_default_dxmt_cache_path,
      get_default_icon_cache_path,
      get_default_log_dir,
      get_default_wine_install_path,
      get_settings_path,
      get_snapshot_root_path,
      get_update_test_runtime_paths,
      is_nightly_update_test_build,
      is_update_test_build,
    } = require("../../../src/Main/Environment/AppPaths") as typeof import("../../../src/Main/Environment/AppPaths");
    const stateRoot = path.join(releaseRoot, "state", profile);
    const dataRoot = path.join(stateRoot, "data");

    expect(is_update_test_build()).toBe(true);
    expect(is_nightly_update_test_build()).toBe(channel === "nightly");
    expect(get_update_test_runtime_paths().stateRoot).toBe(stateRoot);
    expect(get_settings_path()).toBe(path.join(stateRoot, "settings", "settings.json"));
    expect(get_channel_transition_state_path()).toBe(path.join(stateRoot, "settings", "channel-transition.json"));
    expect(get_app_data_root()).toBe(dataRoot);
    expect(get_snapshot_root_path()).toBe(path.join(dataRoot, "Snapshots"));
    expect(get_default_wine_install_path()).toBe(path.join(dataRoot, "Wine"));
    expect(get_default_bottle_prefix_path()).toBe(path.join(dataRoot, "Bottles"));
    expect(get_default_dxmt_cache_path()).toBe(path.join(dataRoot, "DXMT"));
    expect(get_default_log_dir()).toBe(path.join(dataRoot, "logs"));
    expect(get_default_icon_cache_path()).toBe(path.join(dataRoot, "IconCache"));
  });

  it.each(["stable", "beta"])("isolates the %s staging build from production data", async (channel) => {
    process.env.BDIH_IS_PACKAGED = "true";
    process.env.BDIH_STAGING_BUILD = "1";
    process.env.BDIH_STAGING_CHANNEL = channel;
    delete process.env.BDIH_SETTINGS_DIR;
    delete process.env.BDIH_APP_DATA_ROOT;
    delete process.env.BDIH_LEGACY_APP_DATA_ROOT;
    jest.resetModules();

    const {
      get_app_data_root,
      get_legacy_app_data_roots,
      get_settings_path,
      get_staging_update_channel,
      is_staging_launcher_build,
    } = require("../../../src/Main/Environment/AppPaths") as typeof import("../../../src/Main/Environment/AppPaths");
    const expectedDataRoot = path.join(os.homedir(), "Library", "Application Support", "BDIH Launcher Staging");

    expect(is_staging_launcher_build()).toBe(true);
    expect(get_staging_update_channel()).toBe(channel);
    expect(get_settings_path()).toBe(path.join(os.homedir(), ".bdih-launcher-staging", "settings.json"));
    expect(get_app_data_root()).toBe(expectedDataRoot);
    expect(get_legacy_app_data_roots()).toEqual([expectedDataRoot]);
  });

  it("rejects update-test data paths outside the selected tests state root", async () => {
    const releaseRoot = path.join(environment.root, "tests", "Release");
    process.env.BDIH_IS_PACKAGED = "true";
    process.env.BDIH_UPDATE_TEST_BUILD = "true";
    process.env.BDIH_UPDATE_TEST_ROOT = releaseRoot;
    process.env.BDIH_TEST_CHANNEL = "nightly";
    jest.resetModules();

    const {
      constrain_update_test_data_path,
      get_default_bottle_prefix_path,
      get_update_test_runtime_paths,
    } = require("../../../src/Main/Environment/AppPaths") as typeof import("../../../src/Main/Environment/AppPaths");
    const appDataRoot = get_update_test_runtime_paths().appDataRoot;
    const fallbackPath = path.join(appDataRoot, "Bottles");
    const outsidePath = path.join(environment.root, "outside");
    const linkedOutsidePath = path.join(appDataRoot, "linked-outside");

    await mkdir(appDataRoot, { recursive: true });
    await mkdir(outsidePath, { recursive: true });
    await symlink(outsidePath, linkedOutsidePath, "dir");

    expect(() => get_default_bottle_prefix_path(outsidePath)).toThrow(
      /cannot access data outside/,
    );
    expect(() => get_default_bottle_prefix_path(linkedOutsidePath)).toThrow(/cannot access data outside/);
    expect(constrain_update_test_data_path(outsidePath, fallbackPath)).toBe(fallbackPath);
    expect(constrain_update_test_data_path(linkedOutsidePath, fallbackPath)).toBe(fallbackPath);
    expect(constrain_update_test_data_path(path.join(appDataRoot, "..safe"), fallbackPath))
      .toBe(path.join(appDataRoot, "..safe"));
  });
});
