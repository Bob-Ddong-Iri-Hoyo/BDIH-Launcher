import { HoyoPlayProxyManager } from "../../../src/Main/Manager/HoyoPlayProxyManager";
import type {
  WineProcessEvent,
  WineProcessSnapshot,
} from "../../../src/Main/Manager/WineProcessMonitor";

describe("HoyoPlayProxyManager", () => {
  it("stops the matching launcher proxy after the exact routed target exits", () => {
    const stops: Array<{ launcherPrefixPath: string; proxyWinePid: number }> = [];
    const manager = new HoyoPlayProxyManager(async (request) => {
      stops.push({
        launcherPrefixPath: request.launcherPrefixPath,
        proxyWinePid: request.proxyWinePid,
      });
      return 0;
    });
    const proxyProcess = process_event({
      winePid: 88,
      parentWinePid: 44,
      imagePath: "Z:\\helpers\\hoyoplay-proxy.exe",
    });
    const targetProcess = process_event({
      winePid: 120,
      parentWinePid: 112,
      imagePath: "\\\\?\\G:\\Games\\Genshin Impact game\\GenshinImpact.exe",
    });
    const route = manager.registerRoute({
      bottleId: "bottle-1",
      game: "genshin",
      launcherPrefixPath: "/tmp/launcher-prefix",
      gamePrefixPath: "/tmp/game-prefix",
      wineCommand: "/tmp/wine64",
      sourceWinePid: 44,
      stubPath: "Z:\\helpers\\hoyoplay-proxy.exe",
      targetWin: "G:\\Games\\Genshin Impact game\\GenshinImpact.exe",
      launcherSnapshot: process_snapshot("/tmp/launcher-prefix", [proxyProcess]),
      gameSnapshot: process_snapshot("/tmp/game-prefix", []),
    });

    expect(route?.status).toBe("accepted");
    manager.attachGameSession(
      route!.bindingId,
      "prefix-session:game",
      process_snapshot("/tmp/game-prefix", [targetProcess]),
    );
    manager.observeGameProcess("/tmp/game-prefix", {
      ...targetProcess,
      type: "exit",
      sequence: 3,
      exitCode: 0,
    });

    expect(stops).toEqual([{
      launcherPrefixPath: "/tmp/launcher-prefix",
      proxyWinePid: 88,
    }]);
  });

  it("does not stop the proxy when an unrelated bootstrap process exits", () => {
    const stoppedPids: number[] = [];
    const manager = new HoyoPlayProxyManager(async (request) => {
      stoppedPids.push(request.proxyWinePid);
      return 0;
    });
    const proxyProcess = process_event({
      winePid: 88,
      parentWinePid: 44,
      imagePath: "Z:\\helpers\\hoyoplay-proxy.exe",
    });
    const route = manager.registerRoute({
      bottleId: "bottle-1",
      game: "genshin",
      launcherPrefixPath: "/tmp/launcher-prefix",
      gamePrefixPath: "/tmp/game-prefix",
      wineCommand: "/tmp/wine64",
      sourceWinePid: 44,
      stubPath: "Z:\\helpers\\hoyoplay-proxy.exe",
      targetWin: "G:\\Games\\GenshinImpact.exe",
      launcherSnapshot: process_snapshot("/tmp/launcher-prefix", [proxyProcess]),
      gameSnapshot: process_snapshot("/tmp/game-prefix", []),
    });
    const bootstrap = process_event({
      winePid: 112,
      parentWinePid: 0,
      imagePath: "C:\\windows\\system32\\steam.exe",
    });

    manager.attachGameSession(
      route!.bindingId,
      "prefix-session:game",
      process_snapshot("/tmp/game-prefix", [bootstrap]),
    );
    manager.observeGameProcess("/tmp/game-prefix", {
      ...bootstrap,
      type: "exit",
      sequence: 3,
      exitCode: 0,
    });

    expect(stoppedPids).toEqual([]);
  });

  it("stops a late proxy immediately when the routed launch already failed", () => {
    const stoppedPids: number[] = [];
    const manager = new HoyoPlayProxyManager(async (request) => {
      stoppedPids.push(request.proxyWinePid);
      return 0;
    });
    const route = manager.registerRoute({
      bottleId: "bottle-1",
      game: "genshin",
      launcherPrefixPath: "/tmp/launcher-prefix",
      gamePrefixPath: "/tmp/game-prefix",
      wineCommand: "/tmp/wine64",
      sourceWinePid: 44,
      stubPath: "Z:\\helpers\\hoyoplay-proxy.exe",
      targetWin: "G:\\Games\\GenshinImpact.exe",
      launcherSnapshot: process_snapshot("/tmp/launcher-prefix", []),
      gameSnapshot: process_snapshot("/tmp/game-prefix", []),
    });

    manager.failRoute(route!.bindingId, "test launch failure");
    manager.observeLauncherProcess("/tmp/launcher-prefix", process_event({
      winePid: 88,
      parentWinePid: 44,
      imagePath: "Z:\\helpers\\hoyoplay-proxy.exe",
    }));

    expect(stoppedPids).toEqual([88]);
  });

  it("rejects a duplicate route, stops only its proxy, and keeps target ownership on the first route", () => {
    const stoppedPids: number[] = [];
    const manager = new HoyoPlayProxyManager(async (request) => {
      stoppedPids.push(request.proxyWinePid);
      return 0;
    });
    const firstProxy = process_event({
      winePid: 88,
      parentWinePid: 44,
      imagePath: "Z:\\helpers\\hoyoplay-proxy.exe",
    });
    const firstRoute = manager.registerRoute({
      bottleId: "bottle-1",
      game: "zzz",
      launcherPrefixPath: "/tmp/launcher-prefix",
      gamePrefixPath: "/tmp/zzz-prefix",
      wineCommand: "/tmp/wine64",
      sourceWinePid: 44,
      stubPath: "Z:\\helpers\\hoyoplay-proxy.exe",
      targetWin: "G:\\Games\\ZenlessZoneZero.exe",
      launcherSnapshot: process_snapshot("/tmp/launcher-prefix", [firstProxy]),
      gameSnapshot: process_snapshot("/tmp/zzz-prefix", []),
    });
    const target = process_event({
      winePid: 120,
      parentWinePid: 112,
      imagePath: "G:\\Games\\ZenlessZoneZero.exe",
    });

    expect(firstRoute?.status).toBe("accepted");
    manager.observeGameProcess("/tmp/zzz-prefix", target);
    manager.attachGameSession(
      firstRoute!.bindingId,
      "prefix-session:zzz",
      process_snapshot("/tmp/zzz-prefix", [target]),
    );

    const secondProxy = process_event({
      winePid: 96,
      parentWinePid: 44,
      imagePath: "Z:\\helpers\\hoyoplay-proxy.exe",
    });
    const secondRoute = manager.registerRoute({
      bottleId: "bottle-1",
      game: "zzz",
      launcherPrefixPath: "/tmp/launcher-prefix",
      gamePrefixPath: "/tmp/zzz-prefix",
      wineCommand: "/tmp/wine64",
      sourceWinePid: 44,
      stubPath: "Z:\\helpers\\hoyoplay-proxy.exe",
      targetWin: "G:\\Games\\ZenlessZoneZero.exe",
      launcherSnapshot: process_snapshot("/tmp/launcher-prefix", [firstProxy, secondProxy]),
      gameSnapshot: process_snapshot("/tmp/zzz-prefix", [target]),
    });

    expect(secondRoute).toMatchObject({
      status: "duplicate",
      activeBindingId: firstRoute!.bindingId,
      targetUnixPids: [1120],
    });
    expect(stoppedPids).toEqual([96]);

    manager.observeGameProcess("/tmp/zzz-prefix", {
      ...target,
      type: "exit",
      sequence: 4,
      exitCode: 0,
    });

    expect(stoppedPids).toEqual([96, 88]);
  });

  it("rejects a route when the target was already running before BDIH received it", () => {
    const stoppedPids: number[] = [];
    const manager = new HoyoPlayProxyManager(async (request) => {
      stoppedPids.push(request.proxyWinePid);
      return 0;
    });
    const proxy = process_event({
      winePid: 88,
      parentWinePid: 44,
      imagePath: "Z:\\helpers\\hoyoplay-proxy.exe",
    });
    const existingTarget = process_event({
      winePid: 120,
      parentWinePid: 112,
      imagePath: "G:\\Games\\GenshinImpact.exe",
    });
    const route = manager.registerRoute({
      bottleId: "bottle-1",
      game: "genshin",
      launcherPrefixPath: "/tmp/launcher-prefix",
      gamePrefixPath: "/tmp/game-prefix",
      wineCommand: "/tmp/wine64",
      sourceWinePid: 44,
      stubPath: "Z:\\helpers\\hoyoplay-proxy.exe",
      targetWin: "G:\\Games\\GenshinImpact.exe",
      launcherSnapshot: process_snapshot("/tmp/launcher-prefix", [proxy]),
      gameSnapshot: process_snapshot("/tmp/game-prefix", [existingTarget]),
    });

    expect(route).toMatchObject({
      status: "duplicate",
      targetUnixPids: [1120],
    });
    expect(stoppedPids).toEqual([88]);
  });
});

function process_event(
  overrides: Pick<WineProcessEvent, "winePid" | "parentWinePid" | "imagePath">,
): WineProcessEvent {
  return {
    schema: "bdih.wine.process.v1",
    type: "start",
    serverPid: 10,
    sequence: 2,
    winePid: overrides.winePid,
    parentWinePid: overrides.parentWinePid,
    unixPid: 1000 + overrides.winePid,
    isSystem: false,
    startTimeTicks: "133700000000000001",
    imagePath: overrides.imagePath,
  };
}

function process_snapshot(
  prefixPath: string,
  processes: WineProcessEvent[],
): WineProcessSnapshot {
  return {
    prefixPath,
    telemetryReceived: true,
    serverRunning: true,
    processes,
  };
}
