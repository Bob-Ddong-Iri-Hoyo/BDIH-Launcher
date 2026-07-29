import {
  BottleExecutionStateRegistry,
} from "../../../src/Main/Execution/BottleExecutionStateRegistry";

describe("BottleExecutionStateRegistry", () => {
  it("owns the complete launch, run, stop, and exit lifecycle", () => {
    const updates: number[] = [];
    const registry = new BottleExecutionStateRegistry((snapshot) => {
      updates.push(snapshot.revision);
    });
    const operation = registry.beginLaunch({
      bottleId: "bottle-1",
      bottleName: "Bottle 1",
      appId: "hoyoplay",
      appName: "HoYoPlay",
      prefixPath: "/tmp/bottle-1/hoyo-prefix",
    });

    expect(registry.snapshot().executions[0]?.phase).toBe("preparing");

    registry.markStarting(operation);
    registry.markRunning(operation, "prefix-session:1");
    expect(registry.snapshot().executions[0]).toEqual(expect.objectContaining({
      phase: "running",
      processId: "prefix-session:1",
    }));

    registry.markStopping({
      bottleId: "bottle-1",
      appId: "hoyoplay",
    });
    expect(registry.snapshot().executions[0]?.phase).toBe("stopping");

    registry.finishProcess("prefix-session:1");
    expect(registry.snapshot()).toEqual(expect.objectContaining({
      isRunning: false,
      executions: [],
    }));
    expect(updates).toEqual([...updates].sort((left, right) => left - right));
  });

  it("does not resurrect a process that exited before the launch response", () => {
    const registry = new BottleExecutionStateRegistry();
    const operation = registry.beginLaunch({
      bottleId: "bottle-1",
      bottleName: "Bottle 1",
      appId: "manual",
    });

    registry.finishProcess("process:fast-exit", "Wine exited with code 1.");
    registry.markRunning(operation, "process:fast-exit");

    expect(registry.snapshot().executions[0]?.phase).toBe("failed");
    expect(registry.snapshot().executions[0]?.error).toBe("Wine exited with code 1.");
    expect(registry.snapshot().executions[0]?.processId).toBeUndefined();
  });

  it("projects one Prefix session onto launcher and game targets", () => {
    const registry = new BottleExecutionStateRegistry();

    registry.applyPrefixSession({
      bottleId: "bottle-1",
      bottleName: "Bottle 1",
      prefixPath: "/tmp/bottle-1/steam-prefix",
      processId: "prefix-session:steam",
      isRunning: true,
      launcher: "steam",
      appId: "steam:123",
      appIds: ["steam:123"],
      startedAt: "2026-07-30T00:00:00.000Z",
    });

    expect(registry.find("bottle-1", "steam")?.processId).toBe("prefix-session:steam");
    expect(registry.find("bottle-1", "steam:123")?.processId).toBe("prefix-session:steam");

    registry.applyPrefixSession({
      bottleId: "bottle-1",
      bottleName: "Bottle 1",
      prefixPath: "/tmp/bottle-1/steam-prefix",
      processId: "prefix-session:steam",
      isRunning: true,
      launcher: "steam",
      appId: "steam",
      appIds: ["steam"],
    });

    expect(registry.find("bottle-1", "steam")?.phase).toBe("running");
    expect(registry.find("bottle-1", "steam:123")).toBeUndefined();
  });

  it("rejects late updates from an older launch operation", () => {
    const registry = new BottleExecutionStateRegistry();
    const first = registry.beginLaunch({
      bottleId: "bottle-1",
      bottleName: "Bottle 1",
      appId: "hoyoplay",
    });
    const second = registry.beginLaunch({
      bottleId: "bottle-1",
      bottleName: "Bottle 1",
      appId: "hoyoplay",
    });

    registry.markFailed(first, "old failure");
    registry.markRunning(second, "process:new");

    expect(registry.find("bottle-1", "hoyoplay")).toEqual(expect.objectContaining({
      operationId: second.operationId,
      phase: "running",
      processId: "process:new",
    }));
  });
});
