import type { BottleExecutionAvailabilityPayload } from "../../Common/Types/IPC";
import type {
  ExecutionRequirement,
  ExecutionRuntimeDependency,
  ExecutionWineTool,
} from "../../Common/Types/Execution";
import type { WineLauncherOptionsManifest } from "../../Common/Types/Wine";
import {
  assess_execution_strategy_availability,
  type ExecutionCapabilityProbe,
  type ExecutionCapabilityState,
  type ExecutionStrategyAvailabilityPolicy,
} from "./ExecutionAvailability";

export interface BottleExecutionAvailabilityRequest {
  bottleId: string;
  appId?: string;
  wineVersionId: string;
  wineRuntimePath?: string;
}

export interface ExecutionCapabilityInspector<Request> {
  inspectWineRuntime(
    request: Request,
  ): Promise<ExecutionCapabilityState> | ExecutionCapabilityState;
  inspectWineTool(
    request: Request,
    tool: ExecutionWineTool,
  ): Promise<ExecutionCapabilityState> | ExecutionCapabilityState;
  readWineManifest(
    request: Request,
  ):
    | Promise<WineLauncherOptionsManifest | undefined>
    | WineLauncherOptionsManifest
    | undefined;
  inspectDependency(
    request: Request,
    dependency: ExecutionRuntimeDependency,
  ): Promise<ExecutionCapabilityState> | ExecutionCapabilityState;
}

export interface CheckBottleExecutionAvailabilityOptions<
  Request extends BottleExecutionAvailabilityRequest,
> {
  request: Request;
  policy: ExecutionStrategyAvailabilityPolicy<Request>;
  inspector: ExecutionCapabilityInspector<Request>;
  emit: (payload: BottleExecutionAvailabilityPayload) => void;
}

/** Coordinates Strategy preflight without owning any runtime or filesystem API. */
export async function check_bottle_execution_availability<
  Request extends BottleExecutionAvailabilityRequest,
>(
  options: CheckBottleExecutionAvailabilityOptions<Request>,
): Promise<BottleExecutionAvailabilityPayload> {
  const { request, policy, inspector, emit } = options;
  const checkId = `execution-check:${request.bottleId}:${request.appId ?? policy.strategyId}:${Date.now().toString(36)}`;
  const basePayload = {
    checkId,
    bottleId: request.bottleId,
    appId: request.appId,
    providerId: policy.providerId,
    strategyId: policy.strategyId,
    operation: policy.operation,
    wineVersionId: request.wineVersionId,
    wineRuntimePath: request.wineRuntimePath,
  };

  emit({
    ...basePayload,
    status: "checking",
    checkedAt: new Date().toISOString(),
    issues: [],
  });

  const requirements = resolve_requirements(policy, request);
  const probe = await create_capability_probe(request, requirements, inspector);
  const result = await assess_execution_strategy_availability(
    policy,
    request,
    probe,
    requirements,
  );
  const payload: BottleExecutionAvailabilityPayload = {
    ...basePayload,
    status: result.available ? "available" : "unavailable",
    checkedAt: new Date().toISOString(),
    message: result.issues[0]?.message,
    issues: [...result.issues],
  };

  emit(payload);
  return payload;
}

function resolve_requirements<Request>(
  policy: ExecutionStrategyAvailabilityPolicy<Request>,
  request: Request,
): readonly ExecutionRequirement[] {
  return typeof policy.requirements === "function"
    ? policy.requirements(request)
    : policy.requirements;
}

async function create_capability_probe<Request extends BottleExecutionAvailabilityRequest>(
  request: Request,
  requirements: readonly ExecutionRequirement[],
  inspector: ExecutionCapabilityInspector<Request>,
): Promise<ExecutionCapabilityProbe> {
  const requiredTools = unique_values(
    requirements
      .filter((requirement): requirement is Extract<ExecutionRequirement, { kind: "wine-tool" }> =>
        requirement.kind === "wine-tool",
      )
      .map((requirement) => requirement.tool),
  );
  const requiredDependencies = unique_values(
    requirements
      .filter((requirement): requirement is Extract<ExecutionRequirement, { kind: "runtime-dependency" }> =>
        requirement.kind === "runtime-dependency",
      )
      .map((requirement) => requirement.dependency),
  );
  const runtime = await safely_inspect_capability(() =>
    inspector.inspectWineRuntime(request),
  );
  const toolEntries = await Promise.all(
    requiredTools.map(async (tool) => [
      tool,
      await safely_inspect_capability(() => inspector.inspectWineTool(request, tool)),
    ] as const),
  );
  const dependencyEntries = await Promise.all(
    requiredDependencies.map(async (dependency) => [
      dependency,
      await safely_inspect_capability(() =>
        inspector.inspectDependency(request, dependency),
      ),
    ] as const),
  );
  let manifest: WineLauncherOptionsManifest | undefined;

  try {
    manifest = await inspector.readWineManifest(request);
  } catch {
    manifest = undefined;
  }

  return {
    wine: {
      versionId: request.wineVersionId,
      runtimePath: runtime.value,
      runtime,
      tools: Object.fromEntries(toolEntries),
      manifest,
    },
    dependencies: Object.fromEntries(dependencyEntries),
  };
}

function unique_values<Value>(values: readonly Value[]): Value[] {
  return [...new Set(values)];
}

async function safely_inspect_capability(
  inspect: () => Promise<ExecutionCapabilityState> | ExecutionCapabilityState,
): Promise<ExecutionCapabilityState> {
  try {
    return await inspect();
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
