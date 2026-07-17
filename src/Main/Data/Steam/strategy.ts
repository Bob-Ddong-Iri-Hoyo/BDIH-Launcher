import type {
  InstallBottleLauncherPayload,
  RunBottleExecutablePayload,
} from "../../../Common/Types/IPC";
import type { ExecutionRequirement } from "../../../Common/Types/Execution";
import {
  ExecutionStrategyDefinition,
  LauncherInstallStrategyDefinition,
} from "../../Execution/ExecutionStrategy";
import type {
  LauncherInstallExecutionPlan,
  LauncherInstallPlanContext,
} from "../../Execution/LauncherInstallPlan";
import {
  base_wine_strategy_requirements,
  dxmt_strategy_requirement,
} from "../Execution/requirements";

class SteamInstallStrategy extends LauncherInstallStrategyDefinition {
  readonly providerId = "steam";
  readonly strategyId = "steam.install";
  readonly operation = "install" as const;

  requirements(request: InstallBottleLauncherPayload): readonly ExecutionRequirement[] {
    return request.dxmtVersionId
      ? [...base_wine_strategy_requirements(), dxmt_strategy_requirement()]
      : base_wine_strategy_requirements();
  }

  describe(
    context: LauncherInstallPlanContext,
    request: InstallBottleLauncherPayload,
  ): LauncherInstallExecutionPlan {
    return context.launcher.install({
      providerId: this.providerId,
      strategyId: this.strategyId,
      launcher: "steam",
      runtime: request.dxmtVersionId
        ? context.runtime.dxmtWine({ inheritance: "process-tree" })
        : context.runtime.baseWine(),
      prefix: context.prefix.launcher("steam"),
      installer: {
        unsetEnvironment: [
          "WINE_STEAMWEBHELPER_ARGS",
          "DXMT_CONFIG",
          "DXMT_CONFIG_FILE",
          "DXMT_ENABLE_NVEXT",
          "DXMT_LOG_LEVEL",
          "DXMT_LOG_PATH",
          "WINEMSYNC",
        ],
      },
      completion: {
        launcher: "steam",
        requireInstallerExitBeforeTransition: false,
      },
      transition: {
        kind: "adopt-existing",
        supervisor: context.supervisor.steamSession({
          watchGameProcessLog: true,
        }),
      },
    });
  }
}

class SteamLaunchStrategy extends ExecutionStrategyDefinition<RunBottleExecutablePayload> {
  readonly providerId = "steam";
  readonly strategyId = "steam.launch";
  readonly operation = "launch" as const;

  requirements(): readonly ExecutionRequirement[] {
    return base_wine_strategy_requirements();
  }
}

class SteamGameLaunchStrategy extends ExecutionStrategyDefinition<RunBottleExecutablePayload> {
  readonly providerId = "steam";
  readonly strategyId = "steam.game-launch";
  readonly operation = "launch" as const;

  requirements(): readonly ExecutionRequirement[] {
    return base_wine_strategy_requirements();
  }
}

export const STEAM_INSTALL_STRATEGY = new SteamInstallStrategy();
export const STEAM_LAUNCH_STRATEGY = new SteamLaunchStrategy();
export const STEAM_GAME_LAUNCH_STRATEGY = new SteamGameLaunchStrategy();
