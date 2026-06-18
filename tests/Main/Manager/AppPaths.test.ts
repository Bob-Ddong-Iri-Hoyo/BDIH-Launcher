import { jest } from "@jest/globals";
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

  it("routes dev resources into tmp_test_resource while keeping legacy paths readable", async () => {
    const {
      get_default_bottle_prefix_path,
      get_legacy_bottle_prefix_paths,
      get_legacy_settings_path,
      get_settings_path,
      is_dev_resource_environment,
    } = require("../../../src/Main/Environment/AppPaths") as typeof import("../../../src/Main/Environment/AppPaths");

    expect(is_dev_resource_environment()).toBe(true);
    expect(get_settings_path()).toBe(environment.devSettingsPath);
    expect(get_default_bottle_prefix_path()).toBe(path.join(environment.devResourceRoot, "Bottles"));
    expect(get_legacy_settings_path()).toBe(environment.legacySettingsPath);
    expect(get_legacy_bottle_prefix_paths()).toEqual([environment.legacyBottlePrefixRoot]);
  });
});
