import type { RunBottleExecutablePayload } from "../../../Common/Types/IPC";
import type { ExecutionRequirement } from "../../../Common/Types/Execution";
import { ExecutionStrategyDefinition } from "../../Execution/ExecutionStrategy";
import {
  base_wine_strategy_requirements,
  dxmt_strategy_requirement,
} from "../Execution/requirements";

class GenericWineLaunchStrategy extends ExecutionStrategyDefinition<RunBottleExecutablePayload> {
  readonly providerId = "generic-wine";
  readonly strategyId = "generic-wine.launch";
  readonly operation = "launch" as const;

  requirements(request: RunBottleExecutablePayload): readonly ExecutionRequirement[] {
    return requirements_with_optional_dxmt(request);
  }
}

class GenericWineInstallStrategy extends ExecutionStrategyDefinition<RunBottleExecutablePayload> {
  readonly providerId = "generic-wine";
  readonly strategyId = "generic-wine.install";
  readonly operation = "install" as const;

  requirements(request: RunBottleExecutablePayload): readonly ExecutionRequirement[] {
    return requirements_with_optional_dxmt(request);
  }
}

function requirements_with_optional_dxmt(
  request: RunBottleExecutablePayload,
): ExecutionRequirement[] {
  const requirements = base_wine_strategy_requirements();

  if (request.dxmtVersionId) {
    requirements.push(dxmt_strategy_requirement());
  }

  return requirements;
}

export const GENERIC_WINE_LAUNCH_STRATEGY = new GenericWineLaunchStrategy();
export const GENERIC_WINE_INSTALL_STRATEGY = new GenericWineInstallStrategy();
