import type {
  BottleAppExecutionStatePayload,
  BottleExecutionStatePayload,
  BottlePrefixSessionPayload,
} from "../../Common/Types/IPC";
import type { Bottle } from "../Types/Bottle";

export function app_ids_from_prefix_session(
  session: BottlePrefixSessionPayload,
): Set<string> {
  return new Set([
    ...(session.appId ? [session.appId] : []),
    ...(session.appIds ?? []),
  ]);
}

export function apply_execution_state_to_bottles(
  bottles: Bottle[],
  snapshot: BottleExecutionStatePayload,
): Bottle[] {
  const stateByApp = new Map<string, BottleAppExecutionStatePayload>();

  for (const state of snapshot.executions) {
    const key = `${state.bottleId}\u0000${state.appId}`;
    const previous = stateByApp.get(key);

    if (!previous || state.revision > previous.revision) {
      stateByApp.set(key, state);
    }
  }

  return bottles.map((bottle) => ({
    ...bottle,
    apps: bottle.apps.map((app) => {
      const {
        processId: _processId,
        isLaunching: _isLaunching,
        launchError: _launchError,
        ...metadata
      } = app;
      const state = stateByApp.get(`${bottle.id}\u0000${app.id}`);

      if (!state) {
        return metadata;
      }

      if (state.phase === "preparing" || state.phase === "starting") {
        return {
          ...metadata,
          isLaunching: true,
        };
      }

      if (state.phase === "running" || state.phase === "stopping") {
        return {
          ...metadata,
          processId: state.processId,
          isLaunching: false,
        };
      }

      return {
        ...metadata,
        isLaunching: false,
        launchError: state.error,
      };
    }),
  }));
}
