import {
  ExecutionLaunchCoordinator,
} from "../../../src/Main/Execution/ExecutionLaunchCoordinator";

describe("ExecutionLaunchCoordinator", () => {
  it("starts one launch and joins concurrent requests for the same target", async () => {
    const coordinator = new ExecutionLaunchCoordinator<{ ok: boolean; processId: string }>();
    let releaseLaunch: ((value: { ok: boolean; processId: string }) => void) | undefined;
    const launch = jest.fn(() => new Promise<{ ok: boolean; processId: string }>((resolve) => {
      releaseLaunch = resolve;
    }));

    const first = coordinator.coordinate("prefix:hoyoplay", () => undefined, launch);
    const second = coordinator.coordinate("prefix:hoyoplay", () => undefined, launch);

    expect(first.disposition).toBe("started");
    expect(second.disposition).toBe("joined");
    expect(first.result).toBe(second.result);
    expect(launch).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(launch).toHaveBeenCalledTimes(1);

    releaseLaunch?.({ ok: true, processId: "prefix-session:1" });
    await expect(Promise.all([first.result, second.result])).resolves.toEqual([
      { ok: true, processId: "prefix-session:1" },
      { ok: true, processId: "prefix-session:1" },
    ]);
  });

  it("reuses a running target without invoking launch", async () => {
    const coordinator = new ExecutionLaunchCoordinator<{ ok: boolean; processId: string }>();
    const launch = jest.fn();
    const existing = { ok: true, processId: "prefix-session:running" };

    const coordinated = coordinator.coordinate(
      "prefix:hoyoplay",
      () => existing,
      launch,
    );

    expect(coordinated.disposition).toBe("reused");
    await expect(coordinated.result).resolves.toBe(existing);
    expect(launch).not.toHaveBeenCalled();
  });

  it("releases a failed launch so a later request can retry", async () => {
    const coordinator = new ExecutionLaunchCoordinator<string>();
    const firstLaunch = jest.fn(async () => {
      throw new Error("spawn failed");
    });

    const first = coordinator.coordinate("prefix:hoyoplay", () => undefined, firstLaunch);
    await expect(first.result).rejects.toThrow("spawn failed");
    expect(coordinator.hasPending("prefix:hoyoplay")).toBe(false);

    const secondLaunch = jest.fn(async () => "prefix-session:retry");
    const second = coordinator.coordinate("prefix:hoyoplay", () => undefined, secondLaunch);

    expect(second.disposition).toBe("started");
    await expect(second.result).resolves.toBe("prefix-session:retry");
    expect(secondLaunch).toHaveBeenCalledTimes(1);
  });

  it("keeps different logical targets independent", async () => {
    const coordinator = new ExecutionLaunchCoordinator<string>();
    const first = coordinator.coordinate("prefix:a", () => undefined, async () => "a");
    const second = coordinator.coordinate("prefix:b", () => undefined, async () => "b");

    expect(first.disposition).toBe("started");
    expect(second.disposition).toBe("started");
    await expect(Promise.all([first.result, second.result])).resolves.toEqual(["a", "b"]);
  });
});
