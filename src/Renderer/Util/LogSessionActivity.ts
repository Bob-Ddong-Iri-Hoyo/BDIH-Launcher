import type { LogSession } from "../Component/LogViewer";

/**
 * Log output is evidence that work occurred, not that a Bottle process is
 * still alive. Bottle runtime state is owned by explicit process/prefix events.
 */
export function running_state_after_live_log_entry(
  sessionKind: LogSession["kind"],
  currentRunningState: boolean | undefined,
): boolean {
  return sessionKind === "bottle"
    ? Boolean(currentRunningState)
    : true;
}

export function initial_running_state_for_live_log_entry(
  sessionKind: LogSession["kind"],
): boolean {
  return sessionKind !== "bottle";
}
