import type { RunBottleExecutablePayload } from "../../../../Common/Types/IPC";
import type { ExecutionRequirement } from "../../../../Common/Types/Execution";
import { ExecutionStrategyDefinition } from "../../../Execution/ExecutionStrategy";
import {
  base_wine_strategy_requirements,
  dxmt_strategy_requirement,
  hoyo_manifest_group_requirement,
  jadeite_strategy_requirement,
} from "../../Execution/requirements";

class StarRailExecutionStrategy extends ExecutionStrategyDefinition<RunBottleExecutablePayload> {
  readonly providerId = "hoyo:hsr";
  readonly strategyId = "hoyo:hsr.launch";
  readonly operation = "launch" as const;

  requirements(): readonly ExecutionRequirement[] {
    return [
      ...base_wine_strategy_requirements(),
      hoyo_manifest_group_requirement("hoyo-routing"),
      hoyo_manifest_group_requirement("hoyo-network"),
      dxmt_strategy_requirement(),
      jadeite_strategy_requirement(),
    ];
  }
}

export const STARRAIL_EXECUTION_STRATEGY = new StarRailExecutionStrategy();
