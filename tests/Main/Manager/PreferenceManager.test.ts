import { jest } from "@jest/globals";
import { readdir, writeFile } from "fs/promises";
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
  let resourcesPathDescriptor: PropertyDescriptor | undefined;

  beforeEach(async () => {
    environmentSnapshot = capture_manager_environment();
    resourcesPathDescriptor = Object.getOwnPropertyDescriptor(process, "resourcesPath");
    environment = await create_manager_fixture_environment();
    jest.resetModules();
  });

  afterEach(async () => {
    if (resourcesPathDescriptor) {
      Object.defineProperty(process, "resourcesPath", resourcesPathDescriptor);
    } else {
      Reflect.deleteProperty(process, "resourcesPath");
    }
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

  it("uses the packaged staging channel as a default while allowing channel changes", async () => {
    process.env.BDIH_IS_PACKAGED = "true";
    process.env.BDIH_STAGING_BUILD = "1";
    process.env.BDIH_STAGING_CHANNEL = "beta";
    jest.resetModules();

    const { PreferenceManager } = require("../../../src/Main/Manager/PreferenceManager") as typeof import("../../../src/Main/Manager/PreferenceManager");
    const manager = new PreferenceManager();

    expect((await manager.getPreference()).updateChannel).toBe("beta");
    expect((await manager.updatePreference({ updateChannel: "stable" })).updateChannel).toBe("stable");
  });

  it("uses the packaged Production Beta marker only for a new profile", async () => {
    process.env.BDIH_IS_PACKAGED = "true";
    delete process.env.BDIH_RELEASE_CHANNEL;
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: environment.devResourceRoot,
    });
    await writeFile(
      path.join(environment.devResourceRoot, "bdih-release-build.json"),
      `${JSON.stringify({ schemaVersion: 1, channel: "beta" })}\n`,
      "utf8",
    );
    jest.resetModules();

    const { PreferenceManager } = require("../../../src/Main/Manager/PreferenceManager") as typeof import("../../../src/Main/Manager/PreferenceManager");
    const manager = new PreferenceManager(() => "en-US");

    expect((await manager.getPreference()).updateChannel).toBe("beta");
    await manager.updatePreference({ updateChannel: "stable" });

    const reloadedManager = new PreferenceManager(() => "en-US");
    expect((await reloadedManager.getPreference()).updateChannel).toBe("stable");
  });

  it.each([
    ["ko-KR", "ko"],
    ["en-US", "en"],
    ["ja-JP", "ja"],
    ["zh-CN", "zh"],
    ["fr-FR", "en"],
  ])("uses system locale %s as the new-profile language %s", async (systemLocale, expectedLocale) => {
    const { PreferenceManager } = require("../../../src/Main/Manager/PreferenceManager") as typeof import("../../../src/Main/Manager/PreferenceManager");
    const manager = new PreferenceManager(() => systemLocale);

    expect((await manager.getPreference()).language).toBe(expectedLocale);
  });

  it("keeps a saved supported language instead of replacing it with the system locale", async () => {
    await write_legacy_preference(environment, { language: "ja" });

    const { PreferenceManager } = require("../../../src/Main/Manager/PreferenceManager") as typeof import("../../../src/Main/Manager/PreferenceManager");
    const manager = new PreferenceManager(() => "ko-KR");

    expect((await manager.getPreference()).language).toBe("ja");
  });

  it("serializes concurrent preference patches without losing either update", async () => {
    await write_legacy_preference(environment);

    const { PreferenceManager } = require("../../../src/Main/Manager/PreferenceManager") as typeof import("../../../src/Main/Manager/PreferenceManager");
    const manager = new PreferenceManager();

    await Promise.all([
      manager.updatePreference({ appLoggingLevel: "debug" }),
      manager.updatePreference({ themeMode: "dark" }),
    ]);
    await manager.flushPendingWrites();

    const savedPreference = await read_json<Record<string, unknown>>(environment.devSettingsPath);

    expect(savedPreference.appLoggingLevel).toBe("debug");
    expect(savedPreference.themeMode).toBe("dark");
  });

  it("moves invalid settings aside and starts with defaults", async () => {
    await writeFile(environment.devSettingsPath, "", "utf8");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const { PreferenceManager } = require("../../../src/Main/Manager/PreferenceManager") as typeof import("../../../src/Main/Manager/PreferenceManager");
    const manager = new PreferenceManager(() => "ja-JP");
    const preference = await manager.getPreference();
    const entries = await readdir(environment.devResourceRoot);

    expect(preference.language).toBe("ja");
    expect(entries.some((entry) => entry.startsWith("settings.json.invalid-"))).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
