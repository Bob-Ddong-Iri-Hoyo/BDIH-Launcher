import {
  focus_process_ids,
  MacOSWineWindowFocusManager,
} from "../../../src/Main/Util/MacOSWineWindowFocus";

describe("macOS Wine window focus", () => {
  it("prioritizes the launched PID and matching executable before prefix fallbacks", () => {
    expect(focus_process_ids({
      processes: [
        { pid: 300, command: String.raw`C:\Program Files (x86)\Steam\steam.exe -silent` },
        { pid: 200, command: String.raw`Z:\Downloads\SteamSetup.exe` },
        { pid: 400, command: "/tmp/wine/bin/wineserver" },
      ],
      executableNames: ["SteamSetup.exe"],
      preferredPids: [200],
      includePrefixFallback: true,
    })).toEqual([200, 300, 400]);
  });

  it("does not use unrelated prefix processes before the fallback delay", () => {
    expect(focus_process_ids({
      processes: [
        { pid: 300, command: String.raw`C:\Program Files (x86)\Steam\steam.exe -silent` },
      ],
      executableNames: ["SteamSetup.exe"],
      preferredPids: [],
      includePrefixFallback: false,
    })).toEqual([]);
  });

  it("polls until the matching Wine process exposes a visible window", async () => {
    let now = 0;
    let activationCount = 0;
    const manager = new MacOSWineWindowFocusManager({
      platform: "darwin",
      now: () => now,
      delay: async (timeoutMs) => {
        now += timeoutMs;
      },
      pollIntervalMs: 100,
      findProcesses: async () => [
        { pid: 201, command: String.raw`Z:\Downloads\SteamSetup.exe` },
      ],
      activateProcessIds: async () => {
        activationCount += 1;
        return activationCount === 2
          ? { status: "focused", pid: 201 }
          : { status: "not-found" };
      },
    });

    await expect(manager.focus({
      prefixPath: "/tmp/bottle/prefix",
      executableNames: ["SteamSetup.exe"],
      timeoutMs: 1_000,
    })).resolves.toEqual({ status: "focused", pid: 201 });
    expect(activationCount).toBe(2);
  });

  it("returns a foreground activation failure without failing the Wine process", async () => {
    let now = 0;
    const manager = new MacOSWineWindowFocusManager({
      platform: "darwin",
      now: () => now,
      delay: async (timeoutMs) => {
        now += timeoutMs;
      },
      findProcesses: async () => [],
      activateProcessIds: async () => ({
        status: "failed",
        error: "Accessibility permission denied.",
      }),
    });

    await expect(manager.focus({
      prefixPath: "/tmp/bottle/prefix",
      preferredPids: [202],
    })).resolves.toEqual({
      status: "failed",
      error: "Accessibility permission denied.",
    });
  });

  it("supersedes an older request for the same prefix", async () => {
    let resolveFirstDiscovery: ((value: Array<{ pid: number; command: string }>) => void) | undefined;
    const firstDiscovery = new Promise<Array<{ pid: number; command: string }>>((resolve) => {
      resolveFirstDiscovery = resolve;
    });
    const findProcesses = jest.fn()
      .mockImplementationOnce(() => firstDiscovery)
      .mockResolvedValue([
        { pid: 302, command: String.raw`C:\Program Files (x86)\Steam\steam.exe` },
      ]);
    const activateProcessIds = jest.fn().mockResolvedValue({ status: "focused", pid: 302 });
    const manager = new MacOSWineWindowFocusManager({
      platform: "darwin",
      findProcesses,
      activateProcessIds,
    });
    const first = manager.focus({
      prefixPath: "/tmp/bottle/prefix",
      executableNames: ["SteamSetup.exe"],
    });
    const second = manager.focus({
      prefixPath: "/tmp/bottle/prefix",
      executableNames: ["steam.exe"],
    });

    await expect(second).resolves.toEqual({ status: "focused", pid: 302 });
    resolveFirstDiscovery?.([
      { pid: 301, command: String.raw`Z:\Downloads\SteamSetup.exe` },
    ]);
    await expect(first).resolves.toEqual({ status: "superseded" });
    expect(activateProcessIds).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending focus request when its Prefix session ends", async () => {
    let resolveDiscovery: ((value: Array<{ pid: number; command: string }>) => void) | undefined;
    const discovery = new Promise<Array<{ pid: number; command: string }>>((resolve) => {
      resolveDiscovery = resolve;
    });
    const activateProcessIds = jest.fn().mockResolvedValue({ status: "focused", pid: 401 });
    const manager = new MacOSWineWindowFocusManager({
      platform: "darwin",
      findProcesses: async () => discovery,
      activateProcessIds,
    });
    const focus = manager.focus({
      prefixPath: "/tmp/bottle/prefix",
      executableNames: ["HYP.exe"],
    });

    manager.cancel("/tmp/bottle/prefix");
    resolveDiscovery?.([{ pid: 401, command: String.raw`C:\Program Files\HoYoPlay\HYP.exe` }]);

    await expect(focus).resolves.toEqual({ status: "superseded" });
    expect(activateProcessIds).not.toHaveBeenCalled();
  });

  it("does nothing outside macOS", async () => {
    const manager = new MacOSWineWindowFocusManager({ platform: "linux" });

    await expect(manager.focus({
      prefixPath: "/tmp/bottle/prefix",
    })).resolves.toEqual({ status: "unsupported" });
  });
});
