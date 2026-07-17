import type {
  InstallBottleLauncherPayload,
  RunBottleExecutablePayload,
} from "../../../Common/Types/IPC";
import type { ExecutionRequirement } from "../../../Common/Types/Execution";
import { ExecutionStrategyDefinition } from "../../Execution/ExecutionStrategy";
import { base_wine_strategy_requirements } from "../Execution/requirements";

class SteamInstallStrategy extends ExecutionStrategyDefinition<InstallBottleLauncherPayload> {
  readonly providerId = "steam";
  readonly strategyId = "steam.install";
  readonly operation = "install" as const;

  requirements(): readonly ExecutionRequirement[] {
    return base_wine_strategy_requirements();
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
