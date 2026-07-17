import type {
  ExecutionAvailabilityIssue,
  ExecutionOperation,
  ExecutionRequirement,
} from "../../Common/Types/Execution";
import type {
  ExecutionAvailabilityCheckContext,
  ExecutionStrategyAvailabilityPolicy,
} from "./ExecutionAvailability";
import type { InstallBottleLauncherPayload } from "../../Common/Types/IPC";
import type {
  LauncherInstallExecutionPlan,
  LauncherInstallPlanContext,
} from "./LauncherInstallPlan";

/**
 * Base definition inherited by application-owned Strategies.
 *
 * Only preflight is active during the compatibility migration. The execution
 * method will be added when each manager-owned route moves behind Context.
 */
export abstract class ExecutionStrategyDefinition<Request>
implements ExecutionStrategyAvailabilityPolicy<Request> {
  abstract readonly providerId: string;
  abstract readonly strategyId: string;
  abstract readonly operation: ExecutionOperation;

  abstract requirements(request: Request): readonly ExecutionRequirement[];

  checkAvailability?(
    context: ExecutionAvailabilityCheckContext<Request>,
  ): Promise<readonly ExecutionAvailabilityIssue[]>
    | readonly ExecutionAvailabilityIssue[];
}

export interface ExecutionProviderDefinition<
  Profile,
  Strategies extends Record<string, ExecutionStrategyDefinition<any>>,
> {
  profile: Profile;
  strategies: Strategies;
}

export abstract class LauncherInstallStrategyDefinition
extends ExecutionStrategyDefinition<InstallBottleLauncherPayload> {
  abstract describe(
    context: LauncherInstallPlanContext,
    request: InstallBottleLauncherPayload,
  ): LauncherInstallExecutionPlan;
}
