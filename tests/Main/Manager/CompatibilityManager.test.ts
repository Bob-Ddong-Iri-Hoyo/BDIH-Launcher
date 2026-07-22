import { jest } from "@jest/globals";
import path from "path";
import {
  capture_manager_environment,
  create_bottle_fixture,
  create_manager_fixture_environment,
  ManagerFixtureEnvironment,
  remove_manager_fixture_environment,
  restore_manager_environment,
  write_json,
} from "../../fixtures/managerFixtures";

describe("CompatibilityManager", () => {
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

  it("accepts data that matches the Stable build's recorded schema contract", async () => {
    const bottlePath = await create_bottle_fixture(
      path.join(environment.devResourceRoot, "Bottles"),
      "Compatible",
    );
    await write_json(environment.devSettingsPath, { schemaVersion: 1 });
    await write_json(path.join(environment.devResourceRoot, "appmeta.json"), {
      version: 1,
      bottles: [{ id: "compatible", path: bottlePath }],
    });
    const { CompatibilityManager } = require("../../../src/Main/Manager/CompatibilityManager") as typeof import("../../../src/Main/Manager/CompatibilityManager");
    const { create_app_data_compatibility_contract } = require("../../../src/Common/Constant/DataSchema") as typeof import("../../../src/Common/Constant/DataSchema");
    const manager = new CompatibilityManager();
    const contract = create_app_data_compatibility_contract("1.0.0");
    const report = await manager.checkStableReturn({
      schemaVersion: 1,
      id: "return-point",
      state: "active",
      stableVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      dataRootPath: environment.devResourceRoot,
      snapshotRootPath: path.join(environment.devResourceRoot, "Snapshots", "return-point"),
      contract,
      metadata: {
        settings: { sourcePath: environment.devSettingsPath, existed: true },
        bottleRegistry: {
          sourcePath: path.join(environment.devResourceRoot, "appmeta.json"),
          existed: true,
        },
        prefixMetadata: [],
      },
      prefixes: [],
    }, environment.devResourceRoot);

    expect(report.status).toBe("compatible");
    expect(report.preservesUserMetadata).toBe(true);
  });

  it("reports a Bottle schema newer than Stable as incompatible", async () => {
    const bottlePath = await create_bottle_fixture(
      path.join(environment.devResourceRoot, "Bottles"),
      "TooNew",
      { schemaVersion: 2 },
    );
    await write_json(environment.devSettingsPath, { schemaVersion: 1 });
    await write_json(path.join(environment.devResourceRoot, "appmeta.json"), {
      version: 1,
      bottles: [{ id: "too-new", path: bottlePath }],
    });
    const { CompatibilityManager } = require("../../../src/Main/Manager/CompatibilityManager") as typeof import("../../../src/Main/Manager/CompatibilityManager");
    const { create_app_data_compatibility_contract } = require("../../../src/Common/Constant/DataSchema") as typeof import("../../../src/Common/Constant/DataSchema");
    const manager = new CompatibilityManager();
    const contract = create_app_data_compatibility_contract("1.0.0");
    const report = await manager.checkStableReturn({
      schemaVersion: 1,
      id: "return-point",
      state: "active",
      stableVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      dataRootPath: environment.devResourceRoot,
      snapshotRootPath: path.join(environment.devResourceRoot, "Snapshots", "return-point"),
      contract,
      metadata: {
        settings: { sourcePath: environment.devSettingsPath, existed: true },
        bottleRegistry: {
          sourcePath: path.join(environment.devResourceRoot, "appmeta.json"),
          existed: true,
        },
        prefixMetadata: [],
      },
      prefixes: [],
    }, environment.devResourceRoot);

    expect(report.status).toBe("incompatible");
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resource: "bottleMetadata",
        code: "schema-too-new",
        currentVersion: 2,
        supportedMaximum: 1,
      }),
    ]));
  });

  it("does not treat a user-selected Wine version as a schema incompatibility", async () => {
    const bottlePath = await create_bottle_fixture(
      path.join(environment.devResourceRoot, "Bottles"),
      "ChangedWine",
      { wineVersionId: "wine-selected-in-beta" },
    );
    await write_json(environment.devSettingsPath, { schemaVersion: 1 });
    await write_json(path.join(environment.devResourceRoot, "appmeta.json"), {
      version: 1,
      bottles: [{
        id: "changed-wine",
        path: bottlePath,
        wineVersionId: "wine-selected-in-beta",
      }],
    });
    const { CompatibilityManager } = require("../../../src/Main/Manager/CompatibilityManager") as typeof import("../../../src/Main/Manager/CompatibilityManager");
    const { create_app_data_compatibility_contract } = require("../../../src/Common/Constant/DataSchema") as typeof import("../../../src/Common/Constant/DataSchema");
    const manager = new CompatibilityManager();
    const contract = create_app_data_compatibility_contract("1.0.0");
    const report = await manager.checkStableReturn({
      schemaVersion: 1,
      id: "return-point",
      state: "active",
      stableVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      dataRootPath: environment.devResourceRoot,
      snapshotRootPath: path.join(environment.devResourceRoot, "Snapshots", "return-point"),
      contract,
      metadata: {
        settings: { sourcePath: environment.devSettingsPath, existed: true },
        bottleRegistry: {
          sourcePath: path.join(environment.devResourceRoot, "appmeta.json"),
          existed: true,
        },
        prefixMetadata: [],
      },
      prefixes: [],
    }, environment.devResourceRoot);

    expect(report.status).toBe("compatible");
    expect(report.preservesUserMetadata).toBe(true);
  });

  it("returns unknown when persisted metadata is corrupt", async () => {
    const { writeFile } = require("fs/promises") as typeof import("fs/promises");
    await writeFile(environment.devSettingsPath, "not-json", "utf8");
    const { CompatibilityManager } = require("../../../src/Main/Manager/CompatibilityManager") as typeof import("../../../src/Main/Manager/CompatibilityManager");
    const { create_app_data_compatibility_contract } = require("../../../src/Common/Constant/DataSchema") as typeof import("../../../src/Common/Constant/DataSchema");
    const manager = new CompatibilityManager();
    const contract = create_app_data_compatibility_contract("1.0.0");
    const report = await manager.checkStableReturn({
      schemaVersion: 1,
      id: "return-point",
      state: "active",
      stableVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      dataRootPath: environment.devResourceRoot,
      snapshotRootPath: path.join(environment.devResourceRoot, "Snapshots", "return-point"),
      contract,
      metadata: {
        settings: { sourcePath: environment.devSettingsPath, existed: true },
        bottleRegistry: {
          sourcePath: path.join(environment.devResourceRoot, "appmeta.json"),
          existed: false,
        },
        prefixMetadata: [],
      },
      prefixes: [],
    }, environment.devResourceRoot);

    expect(report.status).toBe("unknown");
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ resource: "settings", code: "invalid-metadata" }),
    ]));
  });
});
