import { jest } from "@jest/globals";
import { existsSync } from "fs";
import { mkdir, rm, symlink, writeFile } from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
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

  it("rebases app, prefix, icon, and runtime metadata paths when a bottle is renamed", async () => {
    await write_legacy_preference(environment);
    const previousBottlePath = await create_bottle_fixture(environment.legacyBottlePrefixRoot, "rename-source", {
      wineVersionId: "wine-fixture-10",
    });
    const previousPrefixPath = path.join(previousBottlePath, "manual-prefix");
    const previousIconPath = path.join(previousBottlePath, ".cache", "icons", "manual.ico");
    const previousExecutablePath = path.join(previousPrefixPath, "drive_c", "Fixture", "fixture.exe");
    const previousManifestPath = path.join(previousPrefixPath, "drive_c", "fixture-manifest.json");

    await mkdir(path.dirname(previousIconPath), { recursive: true });
    await mkdir(path.dirname(previousExecutablePath), { recursive: true });
    await mkdir(path.dirname(previousManifestPath), { recursive: true });
    await writeFile(previousIconPath, "icon", "utf8");
    await writeFile(previousExecutablePath, "executable", "utf8");
    await writeFile(previousManifestPath, "manifest", "utf8");
    await writeFile(
      path.join(previousPrefixPath, "bdih-bottle.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "fixture:rename-source",
        bottleId: "fixture:rename-source",
        name: "rename-source",
        bottleName: "rename-source",
        path: previousPrefixPath,
        wineVersionId: "wine-fixture-10",
        status: "ready",
        apps: [],
      }),
      "utf8",
    );
    await write_json(path.join(previousBottlePath, "bdih-bottle.json"), {
      schemaVersion: 1,
      id: "fixture:rename-source",
      bottleId: "fixture:rename-source",
      name: "rename-source",
      bottleName: "rename-source",
      description: "rename fixture",
      path: previousBottlePath,
      prefixPath: environment.legacyBottlePrefixRoot,
      wineVersionId: "wine-fixture-10",
      status: "ready",
      prefixes: [{
        id: `discovered:${previousPrefixPath}`,
        name: "Manual",
        path: previousPrefixPath,
        kind: "custom",
      }],
      apps: [{
        id: "custom:fixture",
        name: "Fixture",
        subtitle: "Manual executable",
        wineVersionId: "wine-fixture-10",
        executablePath: `Z:${previousExecutablePath.replace(/\//g, "\\")}`,
        prefixPath: previousPrefixPath,
        steamManifestPath: previousManifestPath,
        iconSrc: pathToFileURL(previousIconPath).href,
        source: "launcher",
        lastPlayed: "Never launched",
        status: "ready",
        launchError: `spawn ${previousPrefixPath}/.cache/wine ENOENT`,
      }],
      createdAt: "2026-06-17T00:00:00.000Z",
      updatedAt: "2026-06-17T00:00:00.000Z",
    });

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();
    const initialResult = await manager.getBottleList(true);
    const initialBottle = initialResult.bottles.find((bottle) => bottle.id === "fixture:rename-source");
    const nextBottlePath = path.join(environment.legacyBottlePrefixRoot, "renamed-bottle");
    const nextPrefixPath = path.join(nextBottlePath, "manual-prefix");
    const nextIconPath = path.join(nextBottlePath, ".cache", "icons", "manual.ico");
    const nextExecutablePath = path.join(nextPrefixPath, "drive_c", "Fixture", "fixture.exe");
    const nextManifestPath = path.join(nextPrefixPath, "drive_c", "fixture-manifest.json");

    expect(initialBottle).toBeDefined();
    expect(initialBottle?.apps.find((app) => app.id === "custom:fixture")).toBeDefined();

    const result = await manager.saveBottleList({
      bottles: [{
        ...initialBottle!,
        name: "Renamed Bottle",
        path: nextBottlePath,
        updatedAt: new Date().toISOString(),
      }],
    });
    const renamedBottle = result.bottles.find((bottle) => bottle.id === "fixture:rename-source");
    const renamedApp = renamedBottle?.apps.find((app) => app.id === "custom:fixture");
    const persistedMetadata = await read_json<{
      path: string;
      prefixes: Array<{ id: string; path: string }>;
      apps: Array<{
        prefixPath: string;
        steamManifestPath: string;
        iconSrc: string;
        launchError?: string;
      }>;
    }>(path.join(nextBottlePath, "bdih-bottle.json"));
    const prefixMetadata = await read_json<{
      name: string;
      bottleName: string;
      path: string;
    }>(path.join(nextPrefixPath, "bdih-bottle.json"));

    expect(existsSync(previousBottlePath)).toBe(false);
    expect(existsSync(nextBottlePath)).toBe(true);
    expect(renamedBottle).toEqual(expect.objectContaining({
      name: "Renamed Bottle",
      path: nextBottlePath,
    }));
    expect(renamedBottle?.prefixes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `discovered:${nextPrefixPath}`,
        path: nextPrefixPath,
      }),
    ]));
    expect(renamedApp).toEqual(expect.objectContaining({
      executablePath: `Z:${nextExecutablePath.replace(/\//g, "\\")}`,
      prefixPath: nextPrefixPath,
      steamManifestPath: nextManifestPath,
      iconSrc: pathToFileURL(nextIconPath).href,
    }));
    expect(renamedApp?.launchError).toBeUndefined();
    expect(persistedMetadata.path).toBe(nextBottlePath);
    expect(persistedMetadata.prefixes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `discovered:${nextPrefixPath}`,
        path: nextPrefixPath,
      }),
    ]));
    expect(persistedMetadata.apps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        executablePath: `Z:${nextExecutablePath.replace(/\//g, "\\")}`,
        prefixPath: nextPrefixPath,
        steamManifestPath: nextManifestPath,
        iconSrc: pathToFileURL(nextIconPath).href,
      }),
    ]));
    expect(persistedMetadata.apps[0]?.launchError).toBeUndefined();
    expect(prefixMetadata).toEqual(expect.objectContaining({
      name: "Renamed Bottle",
      bottleName: "Renamed Bottle",
      path: nextPrefixPath,
    }));
  });

  it("rejects a rename when its target directory belongs to another bottle", async () => {
    await write_legacy_preference(environment);
    const sourcePath = await create_bottle_fixture(environment.legacyBottlePrefixRoot, "rename-collision");
    const occupiedPath = await create_bottle_fixture(environment.legacyBottlePrefixRoot, "occupied-bottle", {
      id: "fixture:occupied",
      bottleId: "fixture:occupied",
      name: "Different Display Name",
      bottleName: "Different Display Name",
    });

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();
    const initialResult = await manager.getBottleList(true);
    const sourceBottle = initialResult.bottles.find((bottle) => bottle.id === "fixture:rename-collision");

    expect(sourceBottle).toBeDefined();
    await expect(manager.saveBottleList({
      bottles: [{
        ...sourceBottle!,
        name: "Occupied Bottle",
        path: occupiedPath,
        updatedAt: new Date().toISOString(),
      }],
    })).rejects.toThrow(`A different bottle directory already exists at ${occupiedPath}.`);
    expect(existsSync(sourcePath)).toBe(true);
    expect(existsSync(occupiedPath)).toBe(true);
  });

  it("registers only the Steam game whose process launch is reconciled", async () => {
    await write_legacy_preference(environment);
    const bottlePath = await create_bottle_fixture(environment.legacyBottlePrefixRoot, "steam-games", {
      wineVersionId: "wine-fixture-10",
    });
    await create_steam_fixture(bottlePath, "777", "Fixture Quest");
    await create_steam_fixture(bottlePath, "778", "Unlaunched Fixture Quest");

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();
    const initialResult = await manager.getBottleList(true);
    const initialBottle = initialResult.bottles.find((candidate) => candidate.id === "fixture:steam-games");

    expect(initialBottle?.apps.map((app) => app.id)).toEqual(["steam"]);
    await expect(manager.reconcileSteamGameLaunch({
      bottleId: "fixture:steam-games",
      bottlePath,
      steamAppId: "777",
    })).resolves.toEqual({
      appId: "steam:777",
      registered: true,
      changed: true,
    });

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
    expect(bottle?.apps.map((app) => app.id)).not.toContain("steam:778");
  });

  it("does not let a concurrent stale renderer save erase a Steam game launch", async () => {
    await write_legacy_preference(environment);
    const bottlePath = await create_bottle_fixture(environment.legacyBottlePrefixRoot, "steam-launch-race", {
      wineVersionId: "wine-fixture-10",
    });
    const steamAppId = "779";

    await create_steam_fixture(bottlePath, steamAppId, "Concurrent Fixture Quest");

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();
    const initialResult = await manager.getBottleList(true);
    const staleBottle = initialResult.bottles.find((candidate) => candidate.id === "fixture:steam-launch-race");

    expect(staleBottle?.apps.map((app) => app.id)).toEqual(["steam"]);

    const reconciliation = manager.reconcileSteamGameLaunch({
      bottleId: "fixture:steam-launch-race",
      bottlePath,
      steamAppId,
    });
    const staleSave = manager.saveBottleList({
      bottles: [staleBottle!],
    });
    const [reconciliationResult, savedResult] = await Promise.all([reconciliation, staleSave]);

    expect(reconciliationResult.registered).toBe(true);
    expect(savedResult.bottles
      .find((candidate) => candidate.id === "fixture:steam-launch-race")
      ?.apps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `steam:${steamAppId}`,
        name: "Concurrent Fixture Quest",
        steamLaunchConfirmedAt: expect.any(String),
      }),
    ]));

    const persistedResult = await new BottleManager().getBottleList(true);

    expect(persistedResult.bottles
      .find((candidate) => candidate.id === "fixture:steam-launch-race")
      ?.apps.map((app) => app.id)).toContain(`steam:${steamAppId}`);
  });

  it("removes legacy manifest-only Steam entries until their launch is confirmed", async () => {
    await write_legacy_preference(environment);
    const bottlePath = await create_bottle_fixture(environment.legacyBottlePrefixRoot, "legacy-steam-games", {
      wineVersionId: "wine-fixture-10",
    });
    const steamAppId = "775";
    const appId = `steam:${steamAppId}`;
    const manifestPath = path.join(
      bottlePath,
      "drive_c",
      "Program Files (x86)",
      "Steam",
      "steamapps",
      `appmanifest_${steamAppId}.acf`,
    );

    await create_steam_fixture(bottlePath, steamAppId, "Legacy Fixture Quest");
    const metadataPath = path.join(bottlePath, "bdih-bottle.json");
    const metadata = await read_json<Record<string, unknown>>(metadataPath);
    await write_json(metadataPath, {
      ...metadata,
      apps: [{
        id: appId,
        name: "Legacy Fixture Quest",
        subtitle: `Steam App ${steamAppId}`,
        wineVersionId: "wine-fixture-10",
        executablePath: "C:\\Program Files (x86)\\Steam\\steam.exe",
        prefixPath: bottlePath,
        executableArgs: ["-applaunch", steamAppId],
        source: "steam",
        steamAppId,
        steamManifestPath: manifestPath,
        lastPlayed: "Never launched",
        status: "ready",
      }],
    });

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();
    const migratedResult = await manager.getBottleList(true);

    expect(migratedResult.bottles
      .find((candidate) => candidate.id === "fixture:legacy-steam-games")
      ?.apps.map((app) => app.id)).toEqual(["steam"]);

    await manager.reconcileSteamGameLaunch({
      bottleId: "fixture:legacy-steam-games",
      bottlePath,
      steamAppId,
    });
    const confirmedResult = await manager.getBottleList(true);
    const confirmedApp = confirmedResult.bottles
      .find((candidate) => candidate.id === "fixture:legacy-steam-games")
      ?.apps.find((app) => app.id === appId);

    expect(confirmedApp).toEqual(expect.objectContaining({
      id: appId,
      steamAppId,
      steamLaunchConfirmedAt: expect.any(String),
    }));
  });

  it("preserves a user-selected app order across save and prefix rescans", async () => {
    await write_legacy_preference(environment);
    const bottlePath = await create_bottle_fixture(environment.legacyBottlePrefixRoot, "app-order", {
      wineVersionId: "wine-fixture-10",
    });
    const steamAppId = "776";

    await create_steam_fixture(bottlePath, steamAppId, "Ordered Fixture Quest");

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();

    await manager.getBottleList(true);
    await manager.reconcileSteamGameLaunch({
      bottleId: "fixture:app-order",
      bottlePath,
      steamAppId,
    });
    const initialResult = await manager.getBottleList(true);
    const bottle = initialResult.bottles.find((candidate) => candidate.id === "fixture:app-order");

    expect(bottle).toBeDefined();
    const appsById = new Map(bottle?.apps.map((app) => [app.id, app]));
    const reorderedApps = [`steam:${steamAppId}`, "steam"]
      .map((appId) => appsById.get(appId))
      .filter((app): app is NonNullable<typeof app> => Boolean(app));
    const savedResult = await manager.saveBottleList({
      bottles: [{
        ...bottle!,
        apps: reorderedApps,
      }],
    });

    expect(savedResult.bottles
      .find((candidate) => candidate.id === "fixture:app-order")
      ?.apps.map((app) => app.id)).toEqual([`steam:${steamAppId}`, "steam"]);

    const reloadedManager = new BottleManager();
    const reloadedResult = await reloadedManager.getBottleList(true);

    expect(reloadedResult.bottles
      .find((candidate) => candidate.id === "fixture:app-order")
      ?.apps.map((app) => app.id)).toEqual([`steam:${steamAppId}`, "steam"]);
  });

  it("preserves user launch options across save, prefix rescan, and manager restart", async () => {
    await write_legacy_preference(environment);
    const bottlePath = await create_bottle_fixture(environment.legacyBottlePrefixRoot, "launch-options", {
      wineVersionId: "wine-fixture-10",
    });

    await create_steam_fixture(bottlePath);

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();
    const initialResult = await manager.getBottleList(true);
    const bottle = initialResult.bottles.find((candidate) => candidate.id === "fixture:launch-options");

    expect(bottle).toBeDefined();
    const savedResult = await manager.saveBottleList({
      bottles: [{
        ...bottle!,
        apps: bottle!.apps.map((app) => app.id === "steam"
          ? {
              ...app,
              launchOptions: {
                presetId: "custom",
                enableMsync: true,
                metalHud: true,
              },
            }
          : app),
      }],
    });
    const savedSteam = savedResult.bottles
      .find((candidate) => candidate.id === "fixture:launch-options")
      ?.apps.find((app) => app.id === "steam");

    expect(savedSteam?.launchOptions).toEqual(expect.objectContaining({
      presetId: "custom",
      enableMsync: true,
      metalHud: true,
    }));

    const reloadedResult = await new BottleManager().getBottleList(true);
    const reloadedSteam = reloadedResult.bottles
      .find((candidate) => candidate.id === "fixture:launch-options")
      ?.apps.find((app) => app.id === "steam");
    const prefixMetadata = await read_json<{
      apps: Array<{ id: string; launchOptions?: { enableMsync?: boolean; metalHud?: boolean } }>;
    }>(path.join(bottlePath, "bdih-bottle.json"));

    expect(reloadedSteam?.launchOptions).toEqual(expect.objectContaining({
      presetId: "custom",
      enableMsync: true,
      metalHud: true,
    }));
    expect(prefixMetadata.apps.find((app) => app.id === "steam")?.launchOptions).toEqual(
      expect.objectContaining({
        enableMsync: true,
        metalHud: true,
      }),
    );
  });

  it("restores a list-hidden Steam game when Steam launches it again", async () => {
    await write_legacy_preference(environment);
    const bottlePath = await create_bottle_fixture(environment.legacyBottlePrefixRoot, "steam-game-restore", {
      wineVersionId: "wine-fixture-10",
    });
    const steamAppId = "781";
    const appId = `steam:${steamAppId}`;

    await create_steam_fixture(bottlePath, steamAppId, "Restored Fixture Quest");

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();

    await manager.getBottleList(true);
    await manager.reconcileSteamGameLaunch({
      bottleId: "fixture:steam-game-restore",
      bottlePath,
      steamAppId,
    });
    await manager.deleteBottleApp({
      bottleId: "fixture:steam-game-restore",
      bottlePath,
      appId,
      mode: "list",
    });

    const hiddenResult = await manager.getBottleList(true);
    const hiddenBottle = hiddenResult.bottles.find((candidate) => candidate.id === "fixture:steam-game-restore");

    expect(hiddenBottle?.hiddenAppIds).toContain(appId);
    expect(hiddenBottle?.apps.map((app) => app.id)).not.toContain(appId);

    await expect(manager.reconcileSteamGameLaunch({
      bottleId: "fixture:steam-game-restore",
      bottlePath,
      steamAppId,
    })).resolves.toEqual({
      appId,
      registered: true,
      changed: true,
    });

    const restoredResult = await manager.getBottleList(true);
    const restoredBottle = restoredResult.bottles.find((candidate) => candidate.id === "fixture:steam-game-restore");

    expect(restoredBottle?.hiddenAppIds).not.toContain(appId);
    expect(restoredBottle?.apps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: appId,
        name: "Restored Fixture Quest",
        steamAppId,
        executableArgs: ["-applaunch", steamAppId],
      }),
    ]));
    await expect(manager.reconcileSteamGameLaunch({
      bottleId: "fixture:steam-game-restore",
      bottlePath,
      steamAppId,
    })).resolves.toEqual({
      appId,
      registered: true,
      changed: false,
    });
  });

  it("registers a launched Steam game from a shared G: library", async () => {
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
      path.join(sharedSteamAppsPath, `appmanifest_${appId}.acf`),
      `"AppState"\n{\n  "appid" "${appId}"\n  "name" "Shared Fixture Quest"\n}\n`,
      "utf8",
    );
    await symlink(sharedGamesRoot, path.join(dosdevicesPath, "g:"));

    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const manager = new BottleManager();
    const initialResult = await manager.getBottleList(true);
    const initialBottle = initialResult.bottles.find((candidate) => candidate.id === "fixture:steam-shared-games");

    expect(initialBottle?.apps.map((app) => app.id)).toEqual(["steam"]);

    // Steam writes this only after the user adds the shared G: library. Merely
    // exposing G: above must not pre-register every manifest in that folder.
    await writeFile(
      path.join(steamAppsPath, "libraryfolders.vdf"),
      `"libraryfolders"\n{\n  "1"\n  {\n    "path" "G:\\\\SteamLibrary"\n  }\n}\n`,
      "utf8",
    );
    const connectedResult = await manager.getBottleList(true);

    expect(connectedResult.bottles
      .find((candidate) => candidate.id === "fixture:steam-shared-games")
      ?.apps.map((app) => app.id)).toEqual(["steam"]);

    await manager.reconcileSteamGameLaunch({
      bottleId: "fixture:steam-shared-games",
      bottlePath,
      steamAppId: appId,
    });
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
    await manager.reconcileSteamGameLaunch({
      bottleId: "fixture:steam-uninstall",
      bottlePath,
      steamAppId: appId,
    });
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
    await manager.reconcileSteamGameLaunch({
      bottleId: "fixture:steam-disconnected",
      bottlePath,
      steamAppId: appId,
    });
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

    expect(firstResult.bottles
      .find((candidate) => candidate.id === "fixture:multi-prefix")
      ?.apps.map((app) => app.id)).toEqual(["steam"]);
    await manager.reconcileSteamGameLaunch({
      bottleId: "fixture:multi-prefix",
      bottlePath,
      steamAppId: "888",
    });
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
