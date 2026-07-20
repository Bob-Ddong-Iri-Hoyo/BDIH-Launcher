import type {
  InstallBottleLauncherPayload,
  RunBottleExecutablePayload,
} from "../../../../Common/Types/IPC";
import type { ExecutionRequirement } from "../../../../Common/Types/Execution";
import {
  ExecutionStrategyDefinition,
  LauncherInstallStrategyDefinition,
} from "../../../Execution/ExecutionStrategy";
import type {
  LauncherInstallExecutionPlan,
  LauncherInstallPlanContext,
} from "../../../Execution/LauncherInstallPlan";
import {
  base_wine_strategy_requirements,
  hoyo_manifest_group_requirement,
  supervisor_strategy_requirement,
  wine_tool_requirement,
} from "../../Execution/requirements";

class HoyoplayInstallStrategy extends LauncherInstallStrategyDefinition {
  readonly providerId = "hoyoplay";
  readonly strategyId = "hoyoplay.install";
  readonly operation = "install" as const;

  requirements(): readonly ExecutionRequirement[] {
    return [
      ...base_wine_strategy_requirements(),
      wine_tool_requirement("wineserver"),
      hoyo_manifest_group_requirement("hoyo-routing"),
      hoyo_manifest_group_requirement("hoyo-network"),
      supervisor_strategy_requirement("hoyoplay-overseer"),
    ];
  }

  describe(
    context: LauncherInstallPlanContext,
    _request: InstallBottleLauncherPayload,
  ): LauncherInstallExecutionPlan {
    return context.launcher.install({
      providerId: this.providerId,
      strategyId: this.strategyId,
      launcher: "hoyoplay",
      runtime: context.runtime.baseWine(),
      prefix: context.prefix.launcher("hoyoplay"),
      installer: {
        launchOptionsPreset: "hoyoplay",
        unsetEnvironment: [],
      },
      completion: {
        launcher: "hoyoplay",
        transitionReadiness: "installer-exit-or-launcher-process",
      },
      transition: {
        kind: "stop-and-relaunch",
        nextStrategyId: "hoyoplay.supervised-launch",
        supervisor: context.supervisor.hoyoplayOverseer({
          routeGamePrefixes: true,
        }),
      },
    });
  }
}

class HoyoplaySupervisedLaunchStrategy extends ExecutionStrategyDefinition<RunBottleExecutablePayload> {
  readonly providerId = "hoyoplay";
  readonly strategyId = "hoyoplay.supervised-launch";
  readonly operation = "launch" as const;

  requirements(): readonly ExecutionRequirement[] {
    return [
      ...base_wine_strategy_requirements(),
      wine_tool_requirement("wineserver"),
      hoyo_manifest_group_requirement("hoyo-routing"),
      hoyo_manifest_group_requirement("hoyo-network"),
    ];
  }
}

export const HOYOPLAY_INSTALL_STRATEGY = new HoyoplayInstallStrategy();
export const HOYOPLAY_SUPERVISED_LAUNCH_STRATEGY = new HoyoplaySupervisedLaunchStrategy();
