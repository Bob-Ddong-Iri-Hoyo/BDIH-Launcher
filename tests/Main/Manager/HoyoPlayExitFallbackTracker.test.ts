import { HoyoPlayExitFallbackTracker } from "../../../src/Main/Manager/HoyoPlayExitFallbackTracker";
import type {
  WineProcessEvent,
  WineProcessSnapshot,
  WineServerEvent,
} from "../../../src/Main/Manager/WineProcessMonitor";

describe("HoyoPlayExitFallbackTracker", () => {
  it("arms only after observed UI helpers have all exited while HYP remains", () => {
    const tracker = new HoyoPlayExitFallbackTracker();
    const hyp = process_event(1, 300, 32, hyp_path());
    const helperA = process_event(2, 604, 300, helper_path());
    const helperB = process_event(3, 616, 300, helper_path());

    expect(tracker.observe(hyp, snapshot([hyp]), false)).toBe("none");
    expect(tracker.shouldStop(snapshot([hyp]), false)).toBe(false);
    expect(tracker.observe(helperA, snapshot([hyp, helperA]), false)).toBe("none");
    expect(tracker.observe(helperB, snapshot([hyp, helperA, helperB]), false)).toBe("none");

    expect(
      tracker.observe(exit_event(helperA, 4), snapshot([hyp, helperB]), false),
    ).toBe("none");
    expect(
      tracker.observe(exit_event(helperB, 5), snapshot([hyp]), false),
    ).toBe("schedule");
    expect(tracker.shouldStop(snapshot([hyp]), false)).toBe(true);
  });

  it("cancels a pending fallback when a HoYoPlay helper restarts", () => {
    const tracker = new HoyoPlayExitFallbackTracker();
    const hyp = process_event(1, 300, 32, hyp_path());
    const helper = process_event(2, 604, 300, helper_path());

    tracker.observe(helper, snapshot([hyp, helper]), false);
    expect(tracker.observe(exit_event(helper, 3), snapshot([hyp]), false)).toBe("schedule");

    const restartedHelper = process_event(4, 700, 300, helper_path());
    expect(
      tracker.observe(restartedHelper, snapshot([hyp, restartedHelper]), false),
    ).toBe("cancel");
    expect(tracker.shouldStop(snapshot([hyp, restartedHelper]), false)).toBe(false);
  });

  it("does not arm during an updater handoff or while transition processes remain", () => {
    const tracker = new HoyoPlayExitFallbackTracker();
    const hyp = process_event(1, 300, 32, hyp_path());
    const helper = process_event(2, 604, 300, helper_path());
    const updater = process_event(3, 700, 300, updater_path());

    tracker.observe(helper, snapshot([hyp, helper]), false);
    expect(
      tracker.observe(exit_event(helper, 4), snapshot([hyp, updater]), true),
    ).toBe("none");
    expect(tracker.shouldStop(snapshot([hyp, updater]), true)).toBe(false);
    expect(tracker.shouldStop(snapshot([hyp, updater]), false)).toBe(false);
  });

  it("cancels a pending fallback when the Wine server changes", () => {
    const tracker = new HoyoPlayExitFallbackTracker();
    const hyp = process_event(1, 300, 32, hyp_path());
    const helper = process_event(2, 604, 300, helper_path());

    tracker.observe(helper, snapshot([hyp, helper]), false);
    expect(tracker.observe(exit_event(helper, 3), snapshot([hyp]), false)).toBe("schedule");

    const newServer: WineServerEvent = {
      schema: "bdih.wine.process.v1",
      type: "server_start",
      serverPid: 200,
      sequence: 1,
    };
    expect(
      tracker.observe(newServer, snapshot([], 200), false),
    ).toBe("cancel");
  });
});

function process_event(
  sequence: number,
  winePid: number,
  parentWinePid: number,
  imagePath: string,
): WineProcessEvent {
  return {
    schema: "bdih.wine.process.v1",
    type: "start",
    serverPid: 100,
    sequence,
    winePid,
    parentWinePid,
    unixPid: 10_000 + winePid,
    isSystem: false,
    startTimeTicks: String(133_700_000_000_000_000 + sequence),
    imagePath,
  };
}

function exit_event(process: WineProcessEvent, sequence: number): WineProcessEvent {
  return {
    ...process,
    type: "exit",
    sequence,
    exitCode: 0,
  };
}

function snapshot(
  processes: WineProcessEvent[],
  serverPid = 100,
): WineProcessSnapshot {
  return {
    prefixPath: "/tmp/hoyo-prefix",
    telemetryReceived: true,
    serverRunning: true,
    processes: processes.map((process) => ({
      ...process,
      serverPid,
    })),
  };
}

function hyp_path(): string {
  return "\\??\\C:\\Program Files\\HoYoPlay\\1.16.1.364\\HYP.exe";
}

function helper_path(): string {
  return "\\??\\C:\\Program Files\\HoYoPlay\\1.16.1.364\\HYPHelper.exe";
}

function updater_path(): string {
  return "\\??\\C:\\Program Files\\HoYoPlay\\1.16.1.364\\HYUpdater.exe";
}
