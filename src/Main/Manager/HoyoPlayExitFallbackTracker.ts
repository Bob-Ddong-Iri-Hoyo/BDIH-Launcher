import type {
  WineProcessSnapshot,
  WineTelemetryEvent,
} from "./WineProcessMonitor";

export type HoyoPlayExitFallbackDecision = "schedule" | "cancel" | "none";

const HOYOPLAY_EXIT_TRANSITION_EXECUTABLES = new Set([
  "7z.exe",
  "hyupdater.exe",
  "launcher.exe",
]);

/**
 * Detects the Wine-specific HoYoPlay shutdown failure where every Chromium UI
 * helper exits but the root HYP.exe process remains alive.
 *
 * Seeing a helper first is required so the normal launcher bootstrap gap is
 * never mistaken for shutdown. Updater handoffs are excluded by both the
 * update tracker and the active transition process list.
 */
export class HoyoPlayExitFallbackTracker {
  private serverPid?: number;
  private helperSeen = false;
  private shutdownScheduled = false;

  observe(
    event: WineTelemetryEvent,
    snapshot: WineProcessSnapshot,
    updateInProgress: boolean,
  ): HoyoPlayExitFallbackDecision {
    let previousScheduleCancelled = false;

    if (this.serverPid !== undefined && this.serverPid !== event.serverPid) {
      previousScheduleCancelled = this.shutdownScheduled;
      this.resetState();
    }
    this.serverPid = event.serverPid;

    if (event.type === "server_stop") {
      const decision = this.shutdownScheduled ? "cancel" : "none";
      this.reset();
      return decision;
    }

    if (
      "imagePath" in event
      && event.type !== "exit"
      && wine_process_executable_name(event.imagePath) === "hyphelper.exe"
    ) {
      this.helperSeen = true;
    }

    const decision = this.evaluate(snapshot, updateInProgress);
    return previousScheduleCancelled && decision === "none" ? "cancel" : decision;
  }

  observeSnapshot(
    snapshot: WineProcessSnapshot,
    updateInProgress: boolean,
  ): HoyoPlayExitFallbackDecision {
    if (
      snapshot.processes.some((process) =>
        wine_process_executable_name(process.imagePath) === "hyphelper.exe"
      )
    ) {
      this.helperSeen = true;
    }

    return this.evaluate(snapshot, updateInProgress);
  }

  shouldStop(
    snapshot: WineProcessSnapshot,
    updateInProgress: boolean,
  ): boolean {
    if (!this.helperSeen || updateInProgress) {
      return false;
    }

    let hypRunning = false;

    for (const process of snapshot.processes) {
      const executableName = wine_process_executable_name(process.imagePath);

      if (executableName === "hyphelper.exe") {
        return false;
      }
      if (HOYOPLAY_EXIT_TRANSITION_EXECUTABLES.has(executableName)) {
        return false;
      }
      if (executableName === "hyp.exe") {
        hypRunning = true;
      }
    }

    return hypRunning;
  }

  reset(): void {
    this.serverPid = undefined;
    this.resetState();
  }

  private evaluate(
    snapshot: WineProcessSnapshot,
    updateInProgress: boolean,
  ): HoyoPlayExitFallbackDecision {
    const shouldStop = this.shouldStop(snapshot, updateInProgress);

    if (shouldStop && !this.shutdownScheduled) {
      this.shutdownScheduled = true;
      return "schedule";
    }
    if (!shouldStop && this.shutdownScheduled) {
      this.shutdownScheduled = false;
      return "cancel";
    }

    return "none";
  }

  private resetState(): void {
    this.helperSeen = false;
    this.shutdownScheduled = false;
  }
}

function wine_process_executable_name(imagePath: string | undefined): string {
  if (!imagePath) {
    return "";
  }

  const normalizedPath = imagePath.replace(/\\/g, "/");
  return normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1).toLowerCase();
}
