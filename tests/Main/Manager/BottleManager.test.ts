import { jest } from "@jest/globals";
import { mkdir } from "fs/promises";
import path from "path";
import {
  capture_manager_environment,
  create_bottle_fixture,
  create_manager_fixture_environment,
  create_steam_fixture,
  ManagerFixtureEnvironment,
  read_json,
  remove_manager_fixture_environment,
  restore_manager_environment,
  write_json,
  write_legacy_preference,
} from "../../fixtures/managerFixtures";

describe("BottleManager", () => {
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

  it("discovers bottles from the legacy prefix root during dev startup", async () => {
    await write_legacy_preference(environment);
    const bottlePath = await create_bottle_fixture(environment.legacyBottlePrefixRoot, "hoyoplay");

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();
    const result = await manager.getBottleList(true);

    expect(result.bottles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "fixture:hoyoplay",
          name: "hoyoplay",
          path: bottlePath,
        }),
      ]),
    );
  });

  it("still scans legacy prefixes when the dev registry already exists but is empty", async () => {
    await write_legacy_preference(environment);
    await write_json(environment.devBottleRegistryPath, {
      version: 1,
      bottles: [],
      deletedBottleKeys: [],
    });
    await create_bottle_fixture(environment.legacyBottlePrefixRoot, "steam");

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();
    const result = await manager.getBottleList(true);
    const migratedRegistry = await read_json<{ bottles: Array<{ id: string }> }>(path.join(environment.legacyAppDataRoot, "appmeta.json"));

    expect(result.bottles.map((bottle) => bottle.id)).toContain("fixture:steam");
    expect(migratedRegistry.bottles.map((bottle) => bottle.id)).toContain("fixture:steam");
  });

  it("uses a custom bottle prefix from legacy settings as a discovery fallback", async () => {
    const customPrefixRoot = `${environment.root}/custom-prefixes`;

    await write_legacy_preference(environment, {
      bottlePrefixPath: customPrefixRoot,
    });
    await write_json(environment.devSettingsPath, {
      language: "ko",
      wineInstallPath: `${environment.devResourceRoot}/Wine`,
      bottlePrefixPath: `${environment.devResourceRoot}/Bottles`,
      dxmtCachePath: `${environment.devResourceRoot}/DXMT`,
      gameInstallPath: "",
      autoCheckUpdates: true,
      closeToTray: false,
      themeMode: "system",
      appLoggingLevel: "off",
      debugFlagMode: "preset",
      loggingLevel: "off",
      wineDebugArgs: "",
      shortcuts: {
        launch: "Command + Return",
        logs: "Command + L",
        preferences: "Command + ,",
      },
    });
    await create_bottle_fixture(customPrefixRoot, "custom-bottle");

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();
    const result = await manager.getBottleList(true);

    expect(result.bottles.map((bottle) => bottle.id)).toContain("fixture:custom-bottle");
  });

  it("enriches discovered bottles with installed Steam launcher and games", async () => {
    await write_legacy_preference(environment);
    const bottlePath = await create_bottle_fixture(environment.legacyBottlePrefixRoot, "steam-games", {
      wineVersionId: "wine-fixture-10",
    });
    await create_steam_fixture(bottlePath, "777", "Fixture Quest");

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();
    const result = await manager.getBottleList(true);
    const bottle = result.bottles.find((candidate) => candidate.id === "fixture:steam-games");

    expect(bottle?.apps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "steam",
          executablePath: "C:\\Program Files (x86)\\Steam\\steam.exe",
        }),
        expect.objectContaining({
          id: "steam:777",
          name: "Fixture Quest",
          executableArgs: ["-applaunch", "777"],
        }),
      ]),
    );
  });

  it("detects Steam inside a launcher-specific prefix without surfacing the prefix as another bottle", async () => {
    await write_legacy_preference(environment);
    const bottlePath = path.join(environment.legacyBottlePrefixRoot, "multi-prefix");
    const steamPrefixPath = path.join(bottlePath, "steam-prefix");

    await mkdir(bottlePath, { recursive: true });
    await write_json(path.join(bottlePath, "bdih-bottle.json"), {
      schemaVersion: 1,
      id: "fixture:multi-prefix",
      bottleId: "fixture:multi-prefix",
      name: "multi-prefix",
      bottleName: "multi-prefix",
      description: "multi-prefix fixture",
      path: bottlePath,
      prefixPath: environment.legacyBottlePrefixRoot,
      wineVersionId: "wine-fixture-10",
      status: "ready",
      apps: [],
      createdAt: "2026-06-17T00:00:00.000Z",
      updatedAt: "2026-06-17T00:00:00.000Z",
    });
    await create_steam_fixture(steamPrefixPath, "888", "Subprefix Quest");

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();
    const firstResult = await manager.getBottleList(true);
    manager.clearCache();
    const secondResult = await manager.getBottleList(true);
    const bottle = secondResult.bottles.find((candidate) => candidate.id === "fixture:multi-prefix");

    expect(firstResult.bottles.map((candidate) => candidate.name)).not.toContain("steam-prefix");
    expect(secondResult.bottles.map((candidate) => candidate.name)).not.toContain("steam-prefix");
    expect(bottle?.apps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "steam",
          executablePath: "C:\\Program Files (x86)\\Steam\\steam.exe",
        }),
        expect.objectContaining({
          id: "steam:888",
          name: "Subprefix Quest",
          executableArgs: ["-applaunch", "888"],
        }),
      ]),
    );
  });
});
