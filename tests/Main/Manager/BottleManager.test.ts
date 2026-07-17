import { jest } from "@jest/globals";
import { mkdir, rm, symlink, writeFile } from "fs/promises";
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
        logFind: "Command + F",
        logFindNext: "Command + N",
        logFindPrevious: "Command + P",
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

  it("discovers Steam games from a shared G: library", async () => {
    const sharedGamesRoot = path.join(environment.root, "shared-games");
    await write_legacy_preference(environment, {
      gameInstallPath: sharedGamesRoot,
    });
    const bottlePath = await create_bottle_fixture(environment.legacyBottlePrefixRoot, "steam-shared-games", {
      wineVersionId: "wine-fixture-10",
    });
    const steamRoot = path.join(bottlePath, "drive_c", "Program Files (x86)", "Steam");
    const steamAppsPath = path.join(steamRoot, "steamapps");
    const sharedSteamAppsPath = path.join(sharedGamesRoot, "SteamLibrary", "steamapps");
    const dosdevicesPath = path.join(bottlePath, "dosdevices");
    const appId = "778";

    await mkdir(steamAppsPath, { recursive: true });
    await mkdir(sharedSteamAppsPath, { recursive: true });
    await mkdir(dosdevicesPath, { recursive: true });
    await writeFile(path.join(steamRoot, "steam.exe"), "", "utf8");
    await writeFile(
      path.join(steamAppsPath, "libraryfolders.vdf"),
      `"libraryfolders"\n{\n  "1"\n  {\n    "path" "G:\\\\SteamLibrary"\n  }\n}\n`,
      "utf8",
    );
    await writeFile(
      path.join(sharedSteamAppsPath, `appmanifest_${appId}.acf`),
      `"AppState"\n{\n  "appid" "${appId}"\n  "name" "Shared Fixture Quest"\n}\n`,
      "utf8",
    );
    await symlink(sharedGamesRoot, path.join(dosdevicesPath, "g:"));

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();
    const result = await manager.getBottleList(true);
    const bottle = result.bottles.find((candidate) => candidate.id === "fixture:steam-shared-games");

    expect(bottle?.apps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `steam:${appId}`,
          name: "Shared Fixture Quest",
          executableArgs: ["-applaunch", appId],
          steamManifestPath: path.join(sharedSteamAppsPath, `appmanifest_${appId}.acf`),
        }),
      ]),
    );
  });

  it("removes a Steam game shortcut after its manifest is missing for two verified scans", async () => {
    await write_legacy_preference(environment);
    const bottlePath = await create_bottle_fixture(environment.legacyBottlePrefixRoot, "steam-uninstall", {
      wineVersionId: "wine-fixture-10",
    });
    const appId = "779";
    const manifestPath = path.join(
      bottlePath,
      "drive_c",
      "Program Files (x86)",
      "Steam",
      "steamapps",
      `appmanifest_${appId}.acf`,
    );

    await create_steam_fixture(bottlePath, appId, "Removed Fixture Quest");

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();

    await manager.getBottleList(true);
    await rm(manifestPath);

    const firstMissingResult = await manager.getBottleList(true);
    const firstMissingApp = firstMissingResult.bottles
      .find((candidate) => candidate.id === "fixture:steam-uninstall")
      ?.apps.find((app) => app.id === `steam:${appId}`);

    expect(firstMissingApp).toEqual(expect.objectContaining({
      steamManifestMissingChecks: 1,
    }));

    const secondMissingResult = await manager.getBottleList(true);
    const appsAfterConfirmedRemoval = secondMissingResult.bottles
      .find((candidate) => candidate.id === "fixture:steam-uninstall")
      ?.apps ?? [];

    expect(appsAfterConfirmedRemoval.map((app) => app.id)).toContain("steam");
    expect(appsAfterConfirmedRemoval.map((app) => app.id)).not.toContain(`steam:${appId}`);
  });

  it("keeps a Steam game shortcut while its manifest library is disconnected", async () => {
    await write_legacy_preference(environment);
    const bottlePath = await create_bottle_fixture(environment.legacyBottlePrefixRoot, "steam-disconnected", {
      wineVersionId: "wine-fixture-10",
    });
    const appId = "780";
    const steamAppsPath = path.join(
      bottlePath,
      "drive_c",
      "Program Files (x86)",
      "Steam",
      "steamapps",
    );

    await create_steam_fixture(bottlePath, appId, "Disconnected Fixture Quest");

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();

    await manager.getBottleList(true);
    await rm(steamAppsPath, { recursive: true });

    const firstDisconnectedResult = await manager.getBottleList(true);
    const secondDisconnectedResult = await manager.getBottleList(true);
    const disconnectedApp = secondDisconnectedResult.bottles
      .find((candidate) => candidate.id === "fixture:steam-disconnected")
      ?.apps.find((app) => app.id === `steam:${appId}`);

    expect(firstDisconnectedResult.bottles
      .find((candidate) => candidate.id === "fixture:steam-disconnected")
      ?.apps.map((app) => app.id)).toContain(`steam:${appId}`);
    expect(disconnectedApp).toEqual(expect.objectContaining({
      steamAppId: appId,
    }));
    expect(disconnectedApp?.steamManifestMissingChecks).toBeUndefined();
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
