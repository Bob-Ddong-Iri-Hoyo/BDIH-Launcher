import { jest } from "@jest/globals";
import {
  capture_manager_environment,
  create_manager_fixture_environment,
  ManagerFixtureEnvironment,
  remove_manager_fixture_environment,
  restore_manager_environment,
} from "../../fixtures/managerFixtures";

describe("ChannelTransitionManager", () => {
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

  it("creates a Stable return point before Beta and completes it after a compatible Stable return", async () => {
    const { PreferenceManager } = require("../../../src/Main/Manager/PreferenceManager") as typeof import("../../../src/Main/Manager/PreferenceManager");
    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const { SnapshotManager } = require("../../../src/Main/Manager/SnapshotManager") as typeof import("../../../src/Main/Manager/SnapshotManager");
    const { CompatibilityManager } = require("../../../src/Main/Manager/CompatibilityManager") as typeof import("../../../src/Main/Manager/CompatibilityManager");
    const { ChannelTransitionManager } = require("../../../src/Main/Manager/ChannelTransitionManager") as typeof import("../../../src/Main/Manager/ChannelTransitionManager");
    const preferences = new PreferenceManager();
    const snapshots = new SnapshotManager();
    const manager = new ChannelTransitionManager(
      preferences,
      new BottleManager(),
      snapshots,
      new CompatibilityManager(),
      () => "1.0.0",
    );

    const beta = await manager.changeChannel({ channel: "beta" });
    expect(beta).toEqual(expect.objectContaining({
      ok: true,
      applied: true,
      previousChannel: "stable",
      channel: "beta",
    }));
    expect(beta.returnPoint?.stableVersion).toBe("1.0.0");
    expect((await preferences.getPreference()).updateChannel).toBe("beta");

    const stable = await manager.changeChannel({ channel: "stable" });
    expect(stable).toEqual(expect.objectContaining({
      ok: true,
      applied: true,
      previousChannel: "beta",
      channel: "stable",
    }));
    expect(stable.compatibility?.status).toBe("compatible");
    expect((await snapshots.getActiveReturnPoint())?.returnRequestedAt).toBeDefined();

    await manager.reconcileStartup();
    expect(await snapshots.getActiveReturnPoint()).toBeUndefined();
  });

  it("requires explicit confirmation when there is no previous Stable contract", async () => {
    const { PreferenceManager } = require("../../../src/Main/Manager/PreferenceManager") as typeof import("../../../src/Main/Manager/PreferenceManager");
    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const { SnapshotManager } = require("../../../src/Main/Manager/SnapshotManager") as typeof import("../../../src/Main/Manager/SnapshotManager");
    const { CompatibilityManager } = require("../../../src/Main/Manager/CompatibilityManager") as typeof import("../../../src/Main/Manager/CompatibilityManager");
    const { ChannelTransitionManager } = require("../../../src/Main/Manager/ChannelTransitionManager") as typeof import("../../../src/Main/Manager/ChannelTransitionManager");
    const preferences = new PreferenceManager();
    await preferences.updatePreference({ updateChannel: "beta" });
    const manager = new ChannelTransitionManager(
      preferences,
      new BottleManager(),
      new SnapshotManager(),
      new CompatibilityManager(),
      () => "1.0.0-beta.2",
    );

    const guarded = await manager.changeChannel({ channel: "stable" });
    expect(guarded).toEqual(expect.objectContaining({
      ok: true,
      applied: false,
      requiresConfirmation: true,
    }));
    expect(guarded.compatibility?.status).toBe("unknown");
    expect((await preferences.getPreference()).updateChannel).toBe("beta");

    const forced = await manager.changeChannel({ channel: "stable", allowUnsafe: true });
    expect(forced.applied).toBe(true);
    expect((await preferences.getPreference()).updateChannel).toBe("stable");
  });

  it("records a Staging RC as the exact Stable return version", async () => {
    process.env.BDIH_STAGING_BUILD = "1";
    process.env.BDIH_STAGING_CHANNEL = "stable";
    jest.resetModules();

    const { PreferenceManager } = require("../../../src/Main/Manager/PreferenceManager") as typeof import("../../../src/Main/Manager/PreferenceManager");
    const { BottleManager } = require("../../../src/Main/Manager/BottleManager") as typeof import("../../../src/Main/Manager/BottleManager");
    const { SnapshotManager } = require("../../../src/Main/Manager/SnapshotManager") as typeof import("../../../src/Main/Manager/SnapshotManager");
    const { CompatibilityManager } = require("../../../src/Main/Manager/CompatibilityManager") as typeof import("../../../src/Main/Manager/CompatibilityManager");
    const { ChannelTransitionManager } = require("../../../src/Main/Manager/ChannelTransitionManager") as typeof import("../../../src/Main/Manager/ChannelTransitionManager");
    const preferences = new PreferenceManager();
    const snapshots = new SnapshotManager();
    const manager = new ChannelTransitionManager(
      preferences,
      new BottleManager(),
      snapshots,
      new CompatibilityManager(),
      () => "1.0.0-rc.2",
    );

    const beta = await manager.changeChannel({ channel: "beta" });

    expect(beta.applied).toBe(true);
    expect(beta.returnPoint?.stableVersion).toBe("1.0.0-rc.2");
    expect((await snapshots.getActiveReturnPoint())?.stableVersion).toBe("1.0.0-rc.2");
  });
});
