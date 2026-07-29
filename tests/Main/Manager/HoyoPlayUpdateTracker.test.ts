import {
  compare_hoyoplay_versions,
  HoyoPlayUpdateTracker,
  HYP_SINGLETON_REJECTED_EXIT_CODE,
  parse_hoyoplay_version,
} from "../../../src/Main/Manager/HoyoPlayUpdateTracker";
import type {
  WineProcessEvent,
  WineProcessSnapshot,
} from "../../../src/Main/Manager/WineProcessMonitor";

describe("HoyoPlayUpdateTracker", () => {
  it("parses and compares four-part HoYoPlay versions numerically", () => {
    const oldVersion = parse_hoyoplay_version(
      "\\??\\C:\\Program Files\\HoYoPlay\\1.9.0.364\\HYP.exe",
    );
    const newVersion = parse_hoyoplay_version(
      "\\??\\C:\\Program Files\\HoYoPlay\\1.10.0.1\\HYPHelper.exe",
    );

    expect(oldVersion?.value).toBe("1.9.0.364");
    expect(newVersion?.value).toBe("1.10.0.1");
    expect(compare_hoyoplay_versions(newVersion!, oldVersion!)).toBe(1);
    expect(parse_hoyoplay_version("C:\\Program Files\\HoYoPlay\\HYP.exe")).toBeUndefined();
  });

  it("records a normal update only after the old HYP exits and the new helper starts", () => {
    const tracker = new HoyoPlayUpdateTracker();
    const oldHYP = process_event(10, 300, 32, hyp_path("1.16.1.364"));
    const updater = process_event(11, 1340, 300, updater_path("1.16.1.364"));
    const launcher = process_event(12, 1468, 300, launcher_path());
    const newHYP = process_event(14, 1500, 1468, hyp_path("1.17.0.376"));
    const helper = process_event(15, 1512, 1500, helper_path("1.17.0.376"));

    expect(tracker.observe(updater, snapshot([oldHYP, updater]))).toEqual([
      expect.objectContaining({
        kind: "update-started",
        updaterWinePid: 1340,
      }),
    ]);
    expect(tracker.hasActiveAttempt()).toBe(true);
    expect(tracker.observe(launcher, snapshot([oldHYP, updater, launcher]))).toEqual([
      expect.objectContaining({
        kind: "launcher-started",
        parentKind: "old-hyp",
      }),
    ]);
    expect(tracker.observe(newHYP, snapshot([launcher, newHYP]))).toEqual([
      expect.objectContaining({
        kind: "candidate-started",
        parentKind: "old-hyp",
      }),
    ]);
    expect(tracker.observe(helper, snapshot([newHYP, helper]))).toEqual([
      expect.objectContaining({
        kind: "update-succeeded",
        oldHYP: expect.objectContaining({ winePid: 300 }),
        newHYP: expect.objectContaining({ winePid: 1500 }),
      }),
    ]);
    expect(tracker.hasActiveAttempt()).toBe(false);
    expect(tracker.recoveryCandidate(snapshot([newHYP, helper]))).toBeUndefined();
  });

  it("confirms the updater retry singleton failure only after update processes stop", () => {
    const tracker = new HoyoPlayUpdateTracker();
    const oldHYP = process_event(10, 300, 32, hyp_path("1.16.1.364"));
    const updater = process_event(11, 1340, 300, updater_path("1.16.1.364"));
    const launcher = process_event(12, 1592, 1340, launcher_path());
    const newHYP = process_event(13, 1624, 1592, hyp_path("1.17.0.376"));
    const rejected = {
      ...newHYP,
      type: "exit" as const,
      sequence: 14,
      exitCode: HYP_SINGLETON_REJECTED_EXIT_CODE,
    };

    tracker.observe(updater, snapshot([oldHYP, updater]));
    tracker.observe(launcher, snapshot([oldHYP, updater, launcher]));
    tracker.observe(newHYP, snapshot([oldHYP, updater, launcher, newHYP]));
    expect(tracker.observe(rejected, snapshot([oldHYP]))).toEqual([
      expect.objectContaining({
        kind: "candidate-rejected",
        parentKind: "updater",
        exitCode: HYP_SINGLETON_REJECTED_EXIT_CODE,
      }),
    ]);

    expect(tracker.recoveryCandidate(snapshot([oldHYP, updater]))).toBeUndefined();
    expect(tracker.recoveryCandidate(snapshot([oldHYP]))).toEqual(
      expect.objectContaining({
        oldHYP: expect.objectContaining({
          winePid: 300,
          version: expect.objectContaining({ value: "1.16.1.364" }),
        }),
        newHYP: expect.objectContaining({
          winePid: 1624,
          version: expect.objectContaining({ value: "1.17.0.376" }),
        }),
        updaterWinePids: [1340],
        launcherWinePid: 1592,
        candidateExitCode: HYP_SINGLETON_REJECTED_EXIT_CODE,
      }),
    );

    tracker.markRecoveryStarted();
    expect(tracker.recoveryCandidate(snapshot([oldHYP]))).toBeUndefined();
  });

  it("does not recover a same-version duplicate launch", () => {
    const tracker = new HoyoPlayUpdateTracker();
    const oldHYP = process_event(10, 300, 32, hyp_path("1.17.0.376"));
    const updater = process_event(11, 1340, 300, updater_path("1.17.0.376"));
    const launcher = process_event(12, 1592, 1340, launcher_path());
    const duplicateHYP = process_event(13, 1624, 1592, hyp_path("1.17.0.376"));
    const duplicateExit = {
      ...duplicateHYP,
      type: "exit" as const,
      sequence: 14,
      exitCode: HYP_SINGLETON_REJECTED_EXIT_CODE,
    };

    tracker.observe(updater, snapshot([oldHYP, updater]));
    tracker.observe(launcher, snapshot([oldHYP, updater, launcher]));
    expect(tracker.observe(duplicateHYP, snapshot([oldHYP, duplicateHYP]))).toEqual([]);
    expect(tracker.observe(duplicateExit, snapshot([oldHYP]))).toEqual([]);
    expect(tracker.recoveryCandidate(snapshot([oldHYP]))).toBeUndefined();
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

function snapshot(processes: WineProcessEvent[]): WineProcessSnapshot {
  return {
    prefixPath: "/tmp/hoyo-prefix",
    telemetryReceived: true,
    serverRunning: true,
    processes,
  };
}

function hyp_path(version: string): string {
  return `\\??\\C:\\Program Files\\HoYoPlay\\${version}\\HYP.exe`;
}

function helper_path(version: string): string {
  return `\\??\\C:\\Program Files\\HoYoPlay\\${version}\\HYPHelper.exe`;
}

function updater_path(version: string): string {
  return `\\??\\C:\\Program Files\\HoYoPlay\\${version}\\HYUpdater.exe`;
}

function launcher_path(): string {
  return "\\??\\C:\\Program Files\\HoYoPlay\\launcher.exe";
}
