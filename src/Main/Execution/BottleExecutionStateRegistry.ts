import type {
  BottleAppExecutionStatePayload,
  BottleExecutionPhase,
  BottleExecutionStatePayload,
  BottlePrefixSessionPayload,
} from "../../Common/Types/IPC";

export interface BottleExecutionTarget {
  bottleId: string;
  bottleName: string;
  appId: string;
  appName?: string;
  prefixPath?: string;
  targetKey?: string;
}

export interface BottleExecutionOperation extends BottleExecutionTarget {
  operationId: string;
}

type StateListener = (snapshot: BottleExecutionStatePayload) => void;

const TERMINAL_PROCESS_HISTORY_LIMIT = 256;

export function bottle_execution_target_key(
  bottleId: string,
  appId: string,
  prefixPath?: string,
): string {
  return `${bottleId}\u0000${prefixPath ?? ""}\u0000${appId}`;
}

/**
 * Main-process source of truth for transient Bottle application execution.
 *
 * Persistent Bottle metadata deliberately does not live here. The Renderer can
 * join this snapshot with BottleManager metadata, but it must not infer process
 * lifecycle from IPC response/event ordering.
 */
export class BottleExecutionStateRegistry {
  private readonly states = new Map<string, BottleAppExecutionStatePayload>();
  private readonly targetKeysByProcessId = new Map<string, Set<string>>();
  private readonly endedProcesses = new Map<string, string | undefined>();
  private revision = 0;
  private operationSequence = 0;

  constructor(private readonly listener?: StateListener) {}

  beginLaunch(target: BottleExecutionTarget): BottleExecutionOperation {
    const targetKey = target.targetKey
      ?? bottle_execution_target_key(target.bottleId, target.appId, target.prefixPath);
    const operationId = `${Date.now().toString(36)}-${(++this.operationSequence).toString(36)}`;
    const now = new Date().toISOString();

    this.writeState(targetKey, {
      bottleId: target.bottleId,
      bottleName: target.bottleName,
      appId: target.appId,
      appName: target.appName,
      targetKey,
      operationId,
      phase: "preparing",
      revision: 0,
      prefixPath: target.prefixPath,
      updatedAt: now,
    });

    return {
      ...target,
      targetKey,
      operationId,
    };
  }

  markStarting(operation: BottleExecutionOperation): void {
    this.transitionOperation(operation, "starting");
  }

  markRunning(
    operation: BottleExecutionOperation,
    processId: string,
    prefixPath = operation.prefixPath,
  ): void {
    if (this.endedProcesses.has(processId)) {
      const error = this.endedProcesses.get(processId);

      if (error) {
        this.markFailed(operation, error);
      } else {
        this.finishOperation(operation);
      }
      return;
    }

    this.transitionOperation(operation, "running", {
      processId,
      prefixPath,
      startedAt: new Date().toISOString(),
      error: undefined,
    });
  }

  markFailed(operation: BottleExecutionOperation, error: string): void {
    this.transitionOperation(operation, "failed", {
      processId: undefined,
      error,
    });
  }

  find(bottleId: string, appId: string): BottleAppExecutionStatePayload | undefined {
    return [...this.states.values()].find((state) =>
      state.bottleId === bottleId && state.appId === appId,
    );
  }

  markStopping(request: {
    processId?: string;
    bottleId?: string;
    appId?: string;
  }): void {
    const matches = this.matchingStates(request);

    for (const state of matches) {
      this.writeState(state.targetKey, {
        ...state,
        phase: "stopping",
        error: undefined,
      });
    }
  }

  markBottleStopping(bottleId: string): void {
    this.markMatchingStates(
      (state) => state.bottleId === bottleId,
      "stopping",
    );
  }

  markAllStopping(): void {
    this.markMatchingStates(() => true, "stopping");
  }

  cancelStopping(request: {
    processId?: string;
    bottleId?: string;
    appId?: string;
  }, error?: string): void {
    for (const state of this.matchingStates(request)) {
      if (state.phase !== "stopping") {
        continue;
      }

      this.writeState(state.targetKey, {
        ...state,
        phase: state.processId ? "running" : "failed",
        error,
      });
    }
  }

  cancelBottleStopping(bottleId: string, error?: string): void {
    this.cancelStopping({ bottleId }, error);
  }

  cancelAllStopping(error?: string): void {
    this.cancelStopping({}, error);
  }

  finishProcess(processId: string, error?: string): void {
    this.rememberEndedProcess(processId, error);
    const targetKeys = [...(this.targetKeysByProcessId.get(processId) ?? [])];

    for (const targetKey of targetKeys) {
      const state = this.states.get(targetKey);

      if (!state || state.processId !== processId) {
        continue;
      }

      if (error) {
        this.writeState(targetKey, {
          ...state,
          phase: "failed",
          processId: undefined,
          error,
        });
      } else {
        this.deleteState(targetKey);
      }
    }
  }

  finishTarget(bottleId: string, appId: string, error?: string): void {
    for (const state of [...this.states.values()]) {
      if (state.bottleId !== bottleId || state.appId !== appId) {
        continue;
      }

      if (error) {
        this.writeState(state.targetKey, {
          ...state,
          phase: "failed",
          processId: undefined,
          error,
        });
      } else {
        this.deleteState(state.targetKey);
      }
    }
  }

  finishBottle(bottleId: string): void {
    for (const state of [...this.states.values()]) {
      if (state.bottleId === bottleId) {
        this.deleteState(state.targetKey);
      }
    }
  }

  finishAll(): void {
    for (const targetKey of [...this.states.keys()]) {
      this.deleteState(targetKey);
    }
  }

  applyPrefixSession(session: BottlePrefixSessionPayload): void {
    if (!session.isRunning) {
      this.finishProcess(session.processId, session.error);
      return;
    }

    const appIds = new Set<string>([
      ...(session.appId ? [session.appId] : []),
      ...(session.appIds ?? []),
      ...(session.launcher ? [session.launcher] : []),
    ]);
    const previousTargetKeys = new Set(this.targetKeysByProcessId.get(session.processId) ?? []);
    const activeTargetKeys = new Set<string>();

    for (const appId of appIds) {
      const targetKey = bottle_execution_target_key(
        session.bottleId,
        appId,
        session.prefixPath,
      );
      activeTargetKeys.add(targetKey);
      const existing = this.find(session.bottleId, appId);
      const operationId = existing?.operationId
        ?? `session-${session.processId}-${appId}`;

      if (existing && existing.targetKey !== targetKey) {
        this.deleteState(existing.targetKey);
      }

      this.writeState(targetKey, {
        bottleId: session.bottleId,
        bottleName: session.bottleName,
        appId,
        appName: appId === session.appId ? session.appName : undefined,
        targetKey,
        operationId,
        phase: "running",
        revision: 0,
        processId: session.processId,
        prefixPath: session.prefixPath,
        startedAt: session.startedAt,
        updatedAt: new Date().toISOString(),
      });
    }

    for (const targetKey of previousTargetKeys) {
      if (!activeTargetKeys.has(targetKey)) {
        this.deleteState(targetKey);
      }
    }
  }

  snapshot(bottleId?: string): BottleExecutionStatePayload {
    const executions = [...this.states.values()]
      .filter((state) => !bottleId || state.bottleId === bottleId)
      .sort((left, right) =>
        left.bottleId.localeCompare(right.bottleId)
        || left.appId.localeCompare(right.appId),
      )
      .map((state) => ({ ...state }));

    return {
      isRunning: executions.some((state) =>
        state.phase === "preparing"
        || state.phase === "starting"
        || state.phase === "running"
        || state.phase === "stopping",
      ),
      revision: this.revision,
      executions,
    };
  }

  private transitionOperation(
    operation: BottleExecutionOperation,
    phase: BottleExecutionPhase,
    patch: Partial<BottleAppExecutionStatePayload> = {},
  ): void {
    const current = this.states.get(operation.targetKey!);

    if (!current || current.operationId !== operation.operationId) {
      return;
    }

    this.writeState(current.targetKey, {
      ...current,
      ...patch,
      phase,
    });
  }

  private finishOperation(operation: BottleExecutionOperation): void {
    const current = this.states.get(operation.targetKey!);

    if (current?.operationId === operation.operationId) {
      this.deleteState(current.targetKey);
    }
  }

  private matchingStates(request: {
    processId?: string;
    bottleId?: string;
    appId?: string;
  }): BottleAppExecutionStatePayload[] {
    return [...this.states.values()].filter((state) =>
      (request.processId ? state.processId === request.processId : true)
      && (request.bottleId ? state.bottleId === request.bottleId : true)
      && (request.appId ? state.appId === request.appId : true),
    );
  }

  private markMatchingStates(
    predicate: (state: BottleAppExecutionStatePayload) => boolean,
    phase: BottleExecutionPhase,
  ): void {
    for (const state of [...this.states.values()]) {
      if (predicate(state)) {
        this.writeState(state.targetKey, {
          ...state,
          phase,
          error: undefined,
        });
      }
    }
  }

  private writeState(
    targetKey: string,
    state: BottleAppExecutionStatePayload,
  ): void {
    const previous = this.states.get(targetKey);

    if (previous?.processId && previous.processId !== state.processId) {
      this.removeProcessTarget(previous.processId, targetKey);
    }

    const revision = ++this.revision;
    const nextState = {
      ...state,
      targetKey,
      revision,
      updatedAt: new Date().toISOString(),
    };
    this.states.set(targetKey, nextState);

    if (nextState.processId) {
      const targetKeys = this.targetKeysByProcessId.get(nextState.processId) ?? new Set<string>();
      targetKeys.add(targetKey);
      this.targetKeysByProcessId.set(nextState.processId, targetKeys);
    }

    this.listener?.(this.snapshot());
  }

  private deleteState(targetKey: string): void {
    const state = this.states.get(targetKey);

    if (!state) {
      return;
    }

    this.states.delete(targetKey);
    if (state.processId) {
      this.removeProcessTarget(state.processId, targetKey);
    }
    this.revision += 1;
    this.listener?.(this.snapshot());
  }

  private removeProcessTarget(processId: string, targetKey: string): void {
    const targetKeys = this.targetKeysByProcessId.get(processId);
    targetKeys?.delete(targetKey);

    if (!targetKeys || targetKeys.size === 0) {
      this.targetKeysByProcessId.delete(processId);
    }
  }

  private rememberEndedProcess(processId: string, error?: string): void {
    this.endedProcesses.delete(processId);
    this.endedProcesses.set(processId, error);

    while (this.endedProcesses.size > TERMINAL_PROCESS_HISTORY_LIMIT) {
      const oldest = this.endedProcesses.keys().next().value as string | undefined;
      if (!oldest) {
        break;
      }
      this.endedProcesses.delete(oldest);
    }
  }
}
