import { jest } from "@jest/globals";
import path from "path";
import {
  capture_manager_environment,
  create_manager_fixture_environment,
  ManagerFixtureEnvironment,
  read_json,
  remove_manager_fixture_environment,
  restore_manager_environment,
  write_legacy_preference,
} from "../../fixtures/managerFixtures";

describe("PreferenceManager", () => {
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

  it("loads legacy user settings in dev when tmp settings do not exist yet", async () => {
    await write_legacy_preference(environment, {
      bottlePrefixPath: environment.legacyBottlePrefixRoot,
      wineInstallPath: environment.legacyWineRoot,
    });

    const { PreferenceManager } = require("../../../src/Main/Manager/PreferenceManager") as typeof import("../../../src/Main/Manager/PreferenceManager");
    const manager = new PreferenceManager();
    const preference = await manager.getPreference();

    expect(preference.bottlePrefixPath).toBe(environment.legacyBottlePrefixRoot);
    expect(preference.wineInstallPath).toBe(environment.legacyWineRoot);
    expect(preference.dxmtCachePath).toBe(environment.legacyDxmtRoot);
  });

  it("writes updates into the dev tmp settings file", async () => {
    await write_legacy_preference(environment);

    const { PreferenceManager } = require("../../../src/Main/Manager/PreferenceManager") as typeof import("../../../src/Main/Manager/PreferenceManager");
    const manager = new PreferenceManager();
    const nextBottlePrefixPath = path.join(environment.devResourceRoot, "Bottles");

    await manager.updatePreference({
      bottlePrefixPath: nextBottlePrefixPath,
      appLoggingLevel: "debug",
    });

    const savedPreference = await read_json<Record<string, unknown>>(environment.devSettingsPath);

    expect(savedPreference.bottlePrefixPath).toBe(nextBottlePrefixPath);
    expect(savedPreference.appLoggingLevel).toBe("debug");
  });
});
