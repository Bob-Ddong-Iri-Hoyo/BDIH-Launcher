import { jest } from "@jest/globals";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import {
  capture_manager_environment,
  create_bottle_fixture,
  create_manager_fixture_environment,
  ManagerFixtureEnvironment,
  read_json,
  remove_manager_fixture_environment,
  restore_manager_environment,
  write_json,
} from "../../fixtures/managerFixtures";

describe("SnapshotManager", () => {
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

  it("records Stable metadata and snapshots a Prefix only once before mutation", async () => {
    const bottlePath = await create_bottle_fixture(
      path.join(environment.devResourceRoot, "Bottles"),
      "Snapshot",
    );
    const markerPath = path.join(bottlePath, "drive_c", "before-beta.txt");
    await writeFile(markerPath, "stable", "utf8");
    await write_json(environment.devSettingsPath, {
      schemaVersion: 1,
      updateChannel: "stable",
    });
    await write_json(path.join(environment.devResourceRoot, "appmeta.json"), {
      version: 1,
      bottles: [{ id: "snapshot", path: bottlePath }],
    });
    const { SnapshotManager } = require("../../../src/Main/Manager/SnapshotManager") as typeof import("../../../src/Main/Manager/SnapshotManager");
    const { create_app_data_compatibility_contract } = require("../../../src/Common/Constant/DataSchema") as typeof import("../../../src/Common/Constant/DataSchema");
    const manager = new SnapshotManager();
    const returnPoint = await manager.createStableReturnPoint({
      stableVersion: "1.0.0",
      dataRootPath: environment.devResourceRoot,
      contract: create_app_data_compatibility_contract("1.0.0"),
    });

    expect(await read_json(returnPoint.metadata.settings.snapshotPath!)).toEqual(
      expect.objectContaining({ schemaVersion: 1, updateChannel: "stable" }),
    );
    expect(await read_json(returnPoint.metadata.bottleRegistry.snapshotPath!)).toEqual(
      expect.objectContaining({ version: 1 }),
    );
    expect(returnPoint.metadata.prefixMetadata).toHaveLength(1);
    expect(await read_json(returnPoint.metadata.prefixMetadata[0].snapshotPath!)).toEqual(
      expect.objectContaining({ schemaVersion: 1, id: "fixture:Snapshot" }),
    );

    const first = await manager.ensurePrefixSnapshot({
      bottleId: "snapshot",
      prefixPath: bottlePath,
    });
    await writeFile(markerPath, "beta", "utf8");
    const second = await manager.ensurePrefixSnapshot({
      bottleId: "snapshot",
      prefixPath: bottlePath,
    });
    const active = await manager.getActiveReturnPoint();

    expect(second).toEqual(first);
    expect(active?.prefixes).toHaveLength(1);
    expect(await readFile(path.join(first!.snapshotPath!, "drive_c", "before-beta.txt"), "utf8"))
      .toBe("stable");
  });

  it("records a missing Prefix so later creation is not mistaken for Stable data", async () => {
    const { SnapshotManager } = require("../../../src/Main/Manager/SnapshotManager") as typeof import("../../../src/Main/Manager/SnapshotManager");
    const { create_app_data_compatibility_contract } = require("../../../src/Common/Constant/DataSchema") as typeof import("../../../src/Common/Constant/DataSchema");
    const manager = new SnapshotManager();
    await manager.createStableReturnPoint({
      stableVersion: "1.0.0",
      dataRootPath: environment.devResourceRoot,
      contract: create_app_data_compatibility_contract("1.0.0"),
    });
    const missingPath = path.join(environment.devResourceRoot, "Bottles", "CreatedInBeta");
    const entry = await manager.ensurePrefixSnapshot({
      bottleId: "created-in-beta",
      prefixPath: missingPath,
    });

    expect(entry).toEqual(expect.objectContaining({
      originalPath: missingPath,
      existed: false,
      snapshotPath: undefined,
    }));
  });

  it("preserves a Bottle before BottleManager deletes its Prefix", async () => {
    const bottlePath = await create_bottle_fixture(
      path.join(environment.devResourceRoot, "Bottles"),
      "DeleteInBeta",
    );
    const markerPath = path.join(bottlePath, "drive_c", "installed.txt");
    await writeFile(markerPath, "stable install", "utf8");
    await write_json(environment.devSettingsPath, {
      schemaVersion: 1,
      dataRootPath: environment.devResourceRoot,
      bottlePrefixPath: path.join(environment.devResourceRoot, "Bottles"),
      updateChannel: "beta",
    });
    await write_json(path.join(environment.devResourceRoot, "appmeta.json"), {
      version: 1,
      bottles: [{
        id: "fixture:DeleteInBeta",
        name: "DeleteInBeta",
        description: "",
        wineVersionId: "wine-fixture",
        path: bottlePath,
        status: "ready",
        apps: [],
        createdAt: "2026-06-17T00:00:00.000Z",
        updatedAt: "2026-06-17T00:00:00.000Z",
      }],
      deletedBottleKeys: [],
    });
    const { SnapshotManager } = require("../../../src/Main/Manager/SnapshotManager") as typeof import("../../../src/Main/Manager/SnapshotManager");
    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const { create_app_data_compatibility_contract } = require("../../../src/Common/Constant/DataSchema") as typeof import("../../../src/Common/Constant/DataSchema");
    const snapshots = new SnapshotManager();
    await snapshots.createStableReturnPoint({
      stableVersion: "1.0.0",
      dataRootPath: environment.devResourceRoot,
      contract: create_app_data_compatibility_contract("1.0.0"),
    });
    const result = await new BottleManager().deleteBottle({
      bottleId: "fixture:DeleteInBeta",
      bottleName: "DeleteInBeta",
      bottlePath,
    });
    const entry = (await snapshots.getActiveReturnPoint())?.prefixes.find((prefix) =>
      prefix.originalPath === bottlePath,
    );

    expect(result.ok).toBe(true);
    expect(entry?.snapshotPath).toBeDefined();
    expect(await readFile(path.join(entry!.snapshotPath!, "drive_c", "installed.txt"), "utf8"))
      .toBe("stable install");
  });
});
