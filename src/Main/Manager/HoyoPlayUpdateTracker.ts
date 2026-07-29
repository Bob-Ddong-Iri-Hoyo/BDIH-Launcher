import type {
  WineProcessEvent,
  WineProcessSnapshot,
} from "./WineProcessMonitor";

export const HYP_SINGLETON_REJECTED_EXIT_CODE = 0x0e000001;

export interface HoyoPlayVersion {
  value: string;
  parts: [number, number, number, number];
}

export interface HoyoPlayProcessIdentity {
  winePid: number;
  unixPid: number;
  startTimeTicks: string;
  imagePath: string;
  version: HoyoPlayVersion;
}

export interface HoyoPlayUpdateRecoveryCandidate {
  oldHYP: HoyoPlayProcessIdentity;
  newHYP: HoyoPlayProcessIdentity;
  updaterWinePids: number[];
  launcherWinePid: number;
  candidateExitCode: number;
}

export type HoyoPlayUpdateObservation =
  | {
      kind: "update-started";
      oldHYP: HoyoPlayProcessIdentity;
      updaterWinePid: number;
    }
  | {
      kind: "launcher-started";
      oldVersion: string;
      launcherWinePid: number;
      parentKind: "old-hyp" | "updater";
      parentWinePid: number;
    }
  | {
      kind: "candidate-started";
      oldHYP: HoyoPlayProcessIdentity;
      newHYP: HoyoPlayProcessIdentity;
      launcherWinePid: number;
      parentKind: "old-hyp" | "updater";
    }
  | {
      kind: "candidate-rejected";
      oldHYP: HoyoPlayProcessIdentity;
      newHYP: HoyoPlayProcessIdentity;
      launcherWinePid: number;
      parentKind: "old-hyp" | "updater";
      exitCode: number;
    }
  | {
      kind: "update-succeeded";
      oldHYP: HoyoPlayProcessIdentity;
      newHYP: HoyoPlayProcessIdentity;
    };

interface HoyoPlayUpdateAttempt {
  oldHYP: HoyoPlayProcessIdentity;
  updaterWinePids: Set<number>;
  launcherParents: Map<number, "old-hyp" | "updater">;
  candidate?: HoyoPlayProcessIdentity;
  candidateLauncherWinePid?: number;
  candidateParentKind?: "old-hyp" | "updater";
  candidateExitCode?: number;
  candidateHelperSeen: boolean;
  recoveryStarted: boolean;
}

/**
 * Tracks HoYoPlay's updater process tree without inferring state from the UI.
 *
 * HoYoPlay versions are encoded in HYP/HYPHelper executable paths:
 * `C:\Program Files\HoYoPlay\1.17.0.376\HYP.exe`.
 */
export class HoyoPlayUpdateTracker {
  private attempt?: HoyoPlayUpdateAttempt;
  private serverPid?: number;
  private readonly observedSequences = new Set<string>();

  observeSnapshot(snapshot: WineProcessSnapshot): HoyoPlayUpdateObservation[] {
    const observations: HoyoPlayUpdateObservation[] = [];
    const processes = [...snapshot.processes].sort((left, right) => left.sequence - right.sequence);

    for (const process of processes) {
      observations.push(...this.observe(process, snapshot));
    }

    return observations;
  }

  observe(
    event: WineProcessEvent,
    snapshot: WineProcessSnapshot,
  ): HoyoPlayUpdateObservation[] {
    const executableName = wine_process_executable_name(event.imagePath);

    if (!HOYOPLAY_UPDATE_EXECUTABLE_NAMES.has(executableName)) {
      return [];
    }

    if (this.serverPid !== undefined && this.serverPid !== event.serverPid) {
      this.attempt = undefined;
      this.observedSequences.clear();
    }
    this.serverPid = event.serverPid;

    const sequenceKey = `${event.serverPid}:${event.sequence}`;

    if (this.observedSequences.has(sequenceKey)) {
      return [];
    }
    this.observedSequences.add(sequenceKey);

    const observations: HoyoPlayUpdateObservation[] = [];

    if (event.type !== "exit" && executableName === "hyupdater.exe") {
      const parentHYP = find_hyp_process(snapshot, event.parentWinePid);

      if (parentHYP) {
        if (!this.attempt || this.attempt.oldHYP.winePid !== parentHYP.winePid) {
          this.attempt = {
            oldHYP: parentHYP,
            updaterWinePids: new Set(),
            launcherParents: new Map(),
            candidateHelperSeen: false,
            recoveryStarted: false,
          };
        }
        const wasKnown = this.attempt.updaterWinePids.has(event.winePid);

        this.attempt.updaterWinePids.add(event.winePid);
        if (!wasKnown) {
          observations.push({
            kind: "update-started",
            oldHYP: parentHYP,
            updaterWinePid: event.winePid,
          });
        }
      }
    }

    const attempt = this.attempt;

    if (!attempt) {
      return observations;
    }

    if (event.type !== "exit" && executableName === "launcher.exe") {
      const parentKind = event.parentWinePid === attempt.oldHYP.winePid
        ? "old-hyp"
        : attempt.updaterWinePids.has(event.parentWinePid)
          ? "updater"
          : undefined;

      if (parentKind && !attempt.launcherParents.has(event.winePid)) {
        attempt.launcherParents.set(event.winePid, parentKind);
        observations.push({
          kind: "launcher-started",
          oldVersion: attempt.oldHYP.version.value,
          launcherWinePid: event.winePid,
          parentKind,
          parentWinePid: event.parentWinePid,
        });
      }
    }

    if (event.type !== "exit" && executableName === "hyp.exe") {
      const version = parse_hoyoplay_version(event.imagePath);
      const parentKind = attempt.launcherParents.get(event.parentWinePid);

      if (
        version
        && parentKind
        && compare_hoyoplay_versions(version, attempt.oldHYP.version) > 0
      ) {
        const candidate = process_identity(event, version);

        attempt.candidate = candidate;
        attempt.candidateLauncherWinePid = event.parentWinePid;
        attempt.candidateParentKind = parentKind;
        attempt.candidateExitCode = undefined;
        attempt.candidateHelperSeen = false;
        observations.push({
          kind: "candidate-started",
          oldHYP: attempt.oldHYP,
          newHYP: candidate,
          launcherWinePid: event.parentWinePid,
          parentKind,
        });
      }
    }

    if (event.type !== "exit" && executableName === "hyphelper.exe" && attempt.candidate) {
      const helperVersion = parse_hoyoplay_version(event.imagePath);

      if (helperVersion && compare_hoyoplay_versions(helperVersion, attempt.candidate.version) === 0) {
        attempt.candidateHelperSeen = true;
      }
    }

    if (
      event.type === "exit"
      && attempt.candidate
      && event.winePid === attempt.candidate.winePid
    ) {
      attempt.candidateExitCode = normalize_windows_exit_code(event.exitCode);
      if (attempt.candidateExitCode === HYP_SINGLETON_REJECTED_EXIT_CODE) {
        observations.push({
          kind: "candidate-rejected",
          oldHYP: attempt.oldHYP,
          newHYP: attempt.candidate,
          launcherWinePid: attempt.candidateLauncherWinePid ?? event.parentWinePid,
          parentKind: attempt.candidateParentKind ?? "old-hyp",
          exitCode: attempt.candidateExitCode,
        });
      }
    }

    if (
      attempt.candidate
      && attempt.candidateHelperSeen
      && !snapshot.processes.some((process) => process.winePid === attempt.oldHYP.winePid)
      && snapshot.processes.some((process) => process.winePid === attempt.candidate?.winePid)
    ) {
      observations.push({
        kind: "update-succeeded",
        oldHYP: attempt.oldHYP,
        newHYP: attempt.candidate,
      });
      this.attempt = undefined;
    }

    return observations;
  }

  recoveryCandidate(
    snapshot: WineProcessSnapshot,
  ): HoyoPlayUpdateRecoveryCandidate | undefined {
    const attempt = this.attempt;

    if (
      !attempt
      || attempt.recoveryStarted
      || !attempt.candidate
      || attempt.candidateParentKind !== "updater"
      || attempt.candidateExitCode !== HYP_SINGLETON_REJECTED_EXIT_CODE
      || attempt.candidateLauncherWinePid === undefined
      || compare_hoyoplay_versions(attempt.candidate.version, attempt.oldHYP.version) <= 0
    ) {
      return undefined;
    }

    const oldHYP = snapshot.processes.find((process) =>
      process.winePid === attempt.oldHYP.winePid
      && process.startTimeTicks === attempt.oldHYP.startTimeTicks
      && wine_process_executable_name(process.imagePath) === "hyp.exe"
      && parse_hoyoplay_version(process.imagePath)?.value === attempt.oldHYP.version.value,
    );
    const updateInfrastructureStillRunning = snapshot.processes.some((process) => {
      const executableName = wine_process_executable_name(process.imagePath);

      return executableName === "hyupdater.exe"
        || executableName === "launcher.exe"
        || executableName === "7z.exe";
    });
    const candidateStillRunning = snapshot.processes.some((process) =>
      process.winePid === attempt.candidate?.winePid,
    );

    if (!oldHYP || updateInfrastructureStillRunning || candidateStillRunning) {
      return undefined;
    }

    return {
      oldHYP: attempt.oldHYP,
      newHYP: attempt.candidate,
      updaterWinePids: [...attempt.updaterWinePids],
      launcherWinePid: attempt.candidateLauncherWinePid,
      candidateExitCode: attempt.candidateExitCode,
    };
  }

  markRecoveryStarted(): void {
    if (this.attempt) {
      this.attempt.recoveryStarted = true;
    }
  }

  reset(): void {
    this.attempt = undefined;
    this.serverPid = undefined;
    this.observedSequences.clear();
  }
}

const HOYOPLAY_UPDATE_EXECUTABLE_NAMES = new Set([
  "hyp.exe",
  "hyphelper.exe",
  "hyupdater.exe",
  "launcher.exe",
  "7z.exe",
]);

export function parse_hoyoplay_version(imagePath: string | undefined): HoyoPlayVersion | undefined {
  if (!imagePath) {
    return undefined;
  }

  const normalizedPath = imagePath.replace(/\\/g, "/");
  const match = normalizedPath.match(
    /\/HoYoPlay\/(\d+)\.(\d+)\.(\d+)\.(\d+)\/(?:HYP|HYPHelper)\.exe$/i,
  );

  if (!match) {
    return undefined;
  }

  const parts = match.slice(1).map((part) => Number.parseInt(part, 10));

  if (parts.some((part) => !Number.isSafeInteger(part) || part < 0)) {
    return undefined;
  }

  return {
    value: parts.join("."),
    parts: parts as [number, number, number, number],
  };
}

export function compare_hoyoplay_versions(
  left: HoyoPlayVersion,
  right: HoyoPlayVersion,
): number {
  for (let index = 0; index < left.parts.length; index += 1) {
    const difference = left.parts[index] - right.parts[index];

    if (difference !== 0) {
      return difference > 0 ? 1 : -1;
    }
  }

  return 0;
}

function find_hyp_process(
  snapshot: WineProcessSnapshot,
  winePid: number,
): HoyoPlayProcessIdentity | undefined {
  const process = snapshot.processes.find((candidate) =>
    candidate.winePid === winePid
    && wine_process_executable_name(candidate.imagePath) === "hyp.exe",
  );
  const version = parse_hoyoplay_version(process?.imagePath);

  return process && version ? process_identity(process, version) : undefined;
}

function process_identity(
  process: WineProcessEvent,
  version: HoyoPlayVersion,
): HoyoPlayProcessIdentity {
  return {
    winePid: process.winePid,
    unixPid: process.unixPid,
    startTimeTicks: process.startTimeTicks,
    imagePath: process.imagePath ?? "",
    version,
  };
}

function wine_process_executable_name(imagePath: string | undefined): string {
  if (!imagePath) {
    return "";
  }

  const normalizedPath = imagePath.replace(/\\/g, "/");

  return normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1).toLowerCase();
}

function normalize_windows_exit_code(exitCode: number | undefined): number | undefined {
  return exitCode === undefined ? undefined : exitCode >>> 0;
}
