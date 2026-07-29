import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import {
  capture_manager_environment,
  create_manager_fixture_environment,
  ManagerFixtureEnvironment,
  remove_manager_fixture_environment,
  restore_manager_environment,
  write_json,
} from "../../fixtures/managerFixtures";

describe("AppDataMaintenanceManager", () => {
  let environment: ManagerFixtureEnvironment;
  let environmentSnapshot: ReturnType<typeof capture_manager_environment>;
  let bottlePath: string;
  let prefixPath: string;
  let installerPath: string;
  let retiredMetadataPath: string;

  beforeEach(async () => {
    environmentSnapshot = capture_manager_environment();
    environment = await create_manager_fixture_environment();
    bottlePath = path.join(environment.devResourceRoot, "Bottles", "Maintenance");
    prefixPath = path.join(bottlePath, "hoyo-prefix");
    installerPath = path.join(prefixPath, "_bdih_installers", "HoYoPlaySetup.exe");
    retiredMetadataPath = `${installerPath}.bdih.json`;

    await mkdir(path.dirname(installerPath), { recursive: true });
    await writeFile(installerPath, "installer", "utf8");
    await write_json(retiredMetadataPath, {
      url: "https://example.invalid/legacy-installer",
    });
    await write_json(path.join(environment.devResourceRoot, "appmeta.json"), {
      version: 1,
      bottles: [{
        id: "maintenance",
        path: bottlePath,
        prefixes: [{
          id: "maintenance-hoyo",
          path: prefixPath,
          kind: "preset",
          presetId: "hoyoplay",
        }],
        apps: [],
      }],
      deletedBottleKeys: [],
    });
    jest.resetModules();
  });

  afterEach(async () => {
    restore_manager_environment(environmentSnapshot);
    await remove_manager_fixture_environment(environment);
    jest.resetModules();
  });

  it("records the first launch without deleting legacy metadata", async () => {
    const { AppDataMaintenanceManager } = require("../../../src/Main/Manager/AppDataMaintenanceManager") as typeof import("../../../src/Main/Manager/AppDataMaintenanceManager");
    const manager = new AppDataMaintenanceManager(() => "1.0.0", () => "stable");
    const result = await manager.reconcileStartup(environment.devResourceRoot);

    expect(result).toEqual(expect.objectContaining({
      cleanupEligible: false,
      reason: "first-launch",
      removedPaths: [],
    }));
    expect(await readFile(retiredMetadataPath, "utf8")).toContain("legacy-installer");
  });

  it("preserves retired files across Stable to Beta, then removes them on Beta to Beta", async () => {
    const { AppDataMaintenanceManager } = require("../../../src/Main/Manager/AppDataMaintenanceManager") as typeof import("../../../src/Main/Manager/AppDataMaintenanceManager");

    await new AppDataMaintenanceManager(() => "1.0.0", () => "stable")
      .reconcileStartup(environment.devResourceRoot);
    const crossChannel = await new AppDataMaintenanceManager(() => "1.1.0-beta.1", () => "beta")
      .reconcileStartup(environment.devResourceRoot);

    expect(crossChannel).toEqual(expect.objectContaining({
      cleanupEligible: false,
      reason: "channel-transition",
    }));
    expect(await readFile(retiredMetadataPath, "utf8")).toContain("legacy-installer");

    const sameChannel = await new AppDataMaintenanceManager(() => "1.1.0-beta.2", () => "beta")
      .reconcileStartup(environment.devResourceRoot);

    expect(sameChannel).toEqual(expect.objectContaining({
      cleanupEligible: true,
      reason: "same-channel-update",
      removedPaths: [retiredMetadataPath],
    }));
    await expect(readFile(retiredMetadataPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(installerPath, "utf8")).toBe("installer");
  });

  it("removes registered retired files on Nightly to Nightly", async () => {
    const { AppDataMaintenanceManager } = require("../../../src/Main/Manager/AppDataMaintenanceManager") as typeof import("../../../src/Main/Manager/AppDataMaintenanceManager");

    await new AppDataMaintenanceManager(() => "1.2.0-nightly.1", () => "nightly")
      .reconcileStartup(environment.devResourceRoot);
    const result = await new AppDataMaintenanceManager(() => "1.2.0-nightly.2", () => "nightly")
      .reconcileStartup(environment.devResourceRoot);

    expect(result.cleanupEligible).toBe(true);
    expect(result.removedPaths).toEqual([retiredMetadataPath]);
  });

  it("does not clean an external prefix path from registry metadata", async () => {
    const { AppDataMaintenanceManager } = require("../../../src/Main/Manager/AppDataMaintenanceManager") as typeof import("../../../src/Main/Manager/AppDataMaintenanceManager");
    const externalPrefix = path.join(environment.root, "external-prefix");
    const externalMetadata = path.join(externalPrefix, "_bdih_installers", "SteamSetup.exe.bdih.json");

    await write_json(externalMetadata, { url: "https://example.invalid/external" });
    await write_json(path.join(environment.devResourceRoot, "appmeta.json"), {
      version: 1,
      bottles: [{
        id: "maintenance",
        path: bottlePath,
        prefixes: [{ id: "external", path: externalPrefix, kind: "custom" }],
        apps: [],
      }],
      deletedBottleKeys: [],
    });

    await new AppDataMaintenanceManager(() => "1.0.0", () => "stable")
      .reconcileStartup(environment.devResourceRoot);
    await new AppDataMaintenanceManager(() => "1.0.1", () => "stable")
      .reconcileStartup(environment.devResourceRoot);

    expect(await readFile(externalMetadata, "utf8")).toContain("external");
  });
});
