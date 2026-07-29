import type {
  BottleAppExecutionStatePayload,
  BottleExecutionStatePayload,
  InstalledBottleAppPayload,
} from "../../../src/Common/Types/IPC";
import {
  apply_execution_state_to_bottles,
} from "../../../src/Renderer/Logic/BottleExecutionState";
import type { Bottle } from "../../../src/Renderer/Types/Bottle";

describe("Bottle execution state projection", () => {
  it("uses only the Main snapshot for transient application state", () => {
    const bottle = create_bottle();
    bottle.apps[0] = {
      ...bottle.apps[0],
      processId: "stale-process",
      launchError: "stale error",
    };

    const result = apply_execution_state_to_bottles(
      [bottle],
      snapshot(state({
        phase: "starting",
      })),
    );

    expect(result[0].apps[0]).toEqual(expect.objectContaining({
      isLaunching: true,
    }));
    expect(result[0].apps[0].processId).toBeUndefined();
    expect(result[0].apps[0].launchError).toBeUndefined();
  });

  it("clears all stale transient fields when Main has no execution", () => {
    const bottle = create_bottle();
    bottle.apps[0] = {
      ...bottle.apps[0],
      processId: "stale-process",
      isLaunching: true,
      launchError: "stale error",
    };

    const result = apply_execution_state_to_bottles([bottle], snapshot());

    expect(result[0].apps[0].processId).toBeUndefined();
    expect(result[0].apps[0].isLaunching).toBeUndefined();
    expect(result[0].apps[0].launchError).toBeUndefined();
  });

  it("shows running and failed states from Main", () => {
    const running = apply_execution_state_to_bottles(
      [create_bottle()],
      snapshot(state({
        phase: "running",
        processId: "process:1",
      })),
    );
    expect(running[0].apps[0].processId).toBe("process:1");

    const failed = apply_execution_state_to_bottles(
      running,
      snapshot(state({
        phase: "failed",
        error: "spawn failed",
      })),
    );
    expect(failed[0].apps[0].processId).toBeUndefined();
    expect(failed[0].apps[0].launchError).toBe("spawn failed");
  });
});

function create_bottle(): Bottle {
  const app: InstalledBottleAppPayload = {
    id: "hoyoplay",
    name: "HoYoPlay",
    subtitle: "Launcher",
    wineVersionId: "wine-1",
    executablePath: String.raw`C:\Program Files\HoYoPlay\launcher.exe`,
    lastPlayed: "Never launched",
    status: "ready",
  };

  return {
    id: "bottle-1",
    name: "Bottle 1",
    path: "/tmp/bottle-1",
    wineVersionId: "wine-1",
    dxmtVersionId: "",
    description: "",
    status: "ready",
    apps: [app],
  };
}

function state(
  patch: Partial<BottleAppExecutionStatePayload>,
): BottleAppExecutionStatePayload {
  return {
    bottleId: "bottle-1",
    bottleName: "Bottle 1",
    appId: "hoyoplay",
    appName: "HoYoPlay",
    targetKey: "bottle-1:hoyoplay",
    operationId: "operation-1",
    phase: "preparing",
    revision: 1,
    updatedAt: "2026-07-30T00:00:00.000Z",
    ...patch,
  };
}

function snapshot(
  ...executions: BottleAppExecutionStatePayload[]
): BottleExecutionStatePayload {
  return {
    isRunning: executions.some((execution) => execution.phase !== "failed"),
    revision: Math.max(0, ...executions.map((execution) => execution.revision)),
    executions,
  };
}
