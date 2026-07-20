import type {
  BottleLaunchOptionPresetId,
  BottleLauncherKind,
  InstallBottleLauncherPayload,
} from "../../Common/Types/IPC";
import type { ExecutionSupervisor } from "../../Common/Types/Execution";

const REGISTERED_LAUNCHER_SUPERVISORS: ReadonlySet<ExecutionSupervisor> = new Set([
  "steam-session",
  "hoyoplay-overseer",
]);

export type LauncherRuntimeBindingDescriptor =
  | {
      kind: "base-wine";
    }
  | {
      kind: "dxmt-wine";
      inheritance: "process-tree";
    };

export interface LauncherPrefixDescriptor {
  kind: "launcher-prefix";
  launcher: BottleLauncherKind;
}

export type LauncherSupervisorDescriptor =
  | {
      kind: Extract<ExecutionSupervisor, "steam-session">;
      watchGameProcessLog: true;
    }
  | {
      kind: Extract<ExecutionSupervisor, "hoyoplay-overseer">;
      routeGamePrefixes: true;
    };

export type LauncherPostInstallTransition =
  | {
      kind: "adopt-existing";
      supervisor: Extract<LauncherSupervisorDescriptor, { kind: "steam-session" }>;
    }
  | {
      kind: "stop-and-relaunch";
      nextStrategyId: "hoyoplay.supervised-launch";
      supervisor: Extract<LauncherSupervisorDescriptor, { kind: "hoyoplay-overseer" }>;
    }
  | {
      kind: "finish-only";
    };

export interface LauncherInstallExecutionPlan {
  providerId: string;
  strategyId: string;
  launcher: BottleLauncherKind;
  runtime: LauncherRuntimeBindingDescriptor;
  prefix: LauncherPrefixDescriptor;
  installer: {
    launchOptionsPreset?: BottleLaunchOptionPresetId;
    unsetEnvironment: readonly string[];
  };
  completion: {
    launcher: BottleLauncherKind;
    transitionReadiness:
      | "launcher-executable"
      | "installer-exit-or-launcher-process";
  };
  transition: LauncherPostInstallTransition;
}

export interface LauncherInstallPlanContext {
  runtime: {
    baseWine(): LauncherRuntimeBindingDescriptor;
    dxmtWine(options: {
      inheritance: "process-tree";
    }): LauncherRuntimeBindingDescriptor;
  };
  prefix: {
    launcher(launcher: BottleLauncherKind): LauncherPrefixDescriptor;
  };
  supervisor: {
    steamSession(options: {
      watchGameProcessLog: true;
    }): Extract<LauncherSupervisorDescriptor, { kind: "steam-session" }>;
    hoyoplayOverseer(options: {
      routeGamePrefixes: true;
    }): Extract<LauncherSupervisorDescriptor, { kind: "hoyoplay-overseer" }>;
  };
  launcher: {
    install(plan: LauncherInstallExecutionPlan): LauncherInstallExecutionPlan;
  };
}

/**
 * Capability-scoped descriptor builder. These commands only construct a plan;
 * the ExecutionManager owns every filesystem and process side effect.
 */
export function create_launcher_install_plan_context(): LauncherInstallPlanContext {
  return {
    runtime: {
      baseWine: () => ({ kind: "base-wine" }),
      dxmtWine: (options) => ({
        kind: "dxmt-wine",
        inheritance: options.inheritance,
      }),
    },
    prefix: {
      launcher: (launcher) => ({
        kind: "launcher-prefix",
        launcher,
      }),
    },
    supervisor: {
      steamSession: (options) => ({
        kind: "steam-session",
        watchGameProcessLog: options.watchGameProcessLog,
      }),
      hoyoplayOverseer: (options) => ({
        kind: "hoyoplay-overseer",
        routeGamePrefixes: options.routeGamePrefixes,
      }),
    },
    launcher: {
      install: (plan) => plan,
    },
  };
}

export function assert_launcher_install_plan_matches_request(
  plan: LauncherInstallExecutionPlan,
  request: InstallBottleLauncherPayload,
): void {
  if (
    plan.launcher !== request.launcher
    || plan.prefix.launcher !== request.launcher
    || plan.completion.launcher !== request.launcher
  ) {
    throw new Error(
      `Launcher install Strategy produced a mismatched plan: ${plan.strategyId} cannot install ${request.launcher}.`,
    );
  }

  if (plan.runtime.kind === "dxmt-wine" && !request.dxmtVersionId) {
    throw new Error(
      `${plan.strategyId} requires a DXMT runtime binding, but this Bottle has no DXMT version selected.`,
    );
  }

  if (
    plan.transition.kind === "stop-and-relaunch"
    && plan.transition.supervisor.kind !== "hoyoplay-overseer"
  ) {
    throw new Error(`${plan.strategyId} declared an invalid supervised relaunch transition.`);
  }
}

export function is_launcher_supervisor_registered(
  supervisor: ExecutionSupervisor,
): boolean {
  return REGISTERED_LAUNCHER_SUPERVISORS.has(supervisor);
}
