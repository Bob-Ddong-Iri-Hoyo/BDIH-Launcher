import type {
  ExecutionAvailabilityIssue,
  ExecutionOperation,
  ExecutionRequirement,
  ExecutionRuntimeDependency,
  ExecutionWineTool,
} from "../../Common/Types/Execution";
import type { WineLauncherOptionsManifest } from "../../Common/Types/Wine";

export interface ExecutionCapabilityState {
  available: boolean;
  value?: string;
  error?: string;
}

export interface ExecutionCapabilityProbe {
  wine: {
    versionId: string;
    runtimePath?: string;
    runtime: ExecutionCapabilityState;
    tools: Partial<Record<ExecutionWineTool, ExecutionCapabilityState>>;
    manifest?: WineLauncherOptionsManifest;
  };
  dependencies: Partial<Record<ExecutionRuntimeDependency, ExecutionCapabilityState>>;
}

export interface ExecutionAvailabilityCheckContext<Request> {
  request: Request;
  probe: ExecutionCapabilityProbe;
  requirements: readonly ExecutionRequirement[];
  issues: readonly ExecutionAvailabilityIssue[];
}

export interface ExecutionStrategyAvailabilityPolicy<Request> {
  providerId: string;
  strategyId: string;
  operation: ExecutionOperation;
  requirements:
    | readonly ExecutionRequirement[]
    | ((request: Request) => readonly ExecutionRequirement[]);
  checkAvailability?: (
    context: ExecutionAvailabilityCheckContext<Request>,
  ) => Promise<readonly ExecutionAvailabilityIssue[]> | readonly ExecutionAvailabilityIssue[];
}

export interface ExecutionStrategyAvailabilityResult {
  available: boolean;
  requirements: readonly ExecutionRequirement[];
  issues: readonly ExecutionAvailabilityIssue[];
}

/**
 * Evaluates the declarative requirements first, then lets a Strategy append
 * application-specific diagnostics without receiving internal managers.
 */
export async function assess_execution_strategy_availability<Request>(
  policy: ExecutionStrategyAvailabilityPolicy<Request>,
  request: Request,
  probe: ExecutionCapabilityProbe,
  resolvedRequirements?: readonly ExecutionRequirement[],
): Promise<ExecutionStrategyAvailabilityResult> {
  const requirements = resolvedRequirements
    ?? (
      typeof policy.requirements === "function"
        ? policy.requirements(request)
        : policy.requirements
    );
  const issues = requirements.flatMap((requirement) =>
    assess_requirement(requirement, probe),
  );
  const customIssues = policy.checkAvailability
    ? await policy.checkAvailability({
        request,
        probe,
        requirements,
        issues,
      })
    : [];
  const deduplicatedIssues = deduplicate_issues([...issues, ...customIssues]);

  return {
    available: deduplicatedIssues.length === 0,
    requirements,
    issues: deduplicatedIssues,
  };
}

function assess_requirement(
  requirement: ExecutionRequirement,
  probe: ExecutionCapabilityProbe,
): ExecutionAvailabilityIssue[] {
  if (requirement.kind === "wine-runtime") {
    return probe.wine.runtime.available
      ? []
      : [create_issue(
          requirement,
          "wine-runtime-missing",
          probe.wine.runtime.error
            ?? `Wine runtime is not installed or extracted: ${probe.wine.versionId}.`,
        )];
  }

  // A missing runtime is the root cause for every Wine-owned capability. Do
  // not flood the UI with one follow-up issue per missing tool or manifest key.
  if (!probe.wine.runtime.available && requirement.kind !== "runtime-dependency") {
    return [];
  }

  if (requirement.kind === "wine-tool") {
    const state = probe.wine.tools[requirement.tool];

    return state?.available
      ? []
      : [create_issue(
          requirement,
          "wine-tool-missing",
          state?.error
            ?? `Selected Wine runtime does not provide ${requirement.tool}.`,
        )];
  }

  if (requirement.kind === "wine-manifest") {
    return probe.wine.manifest
      ? []
      : [missing_manifest_issue(requirement, probe)];
  }

  if (requirement.kind === "wine-manifest-group") {
    if (!probe.wine.manifest) {
      return [missing_manifest_issue(requirement, probe)];
    }

    return probe.wine.manifest.groups.some((group) => group.id === requirement.groupId)
      ? []
      : [create_issue(
          requirement,
          "wine-manifest-group-missing",
          `Unsupported Wine runtime: ${probe.wine.manifest.name} does not declare the required ${requirement.groupId} capability group.`,
        )];
  }

  if (requirement.kind === "wine-launch-option") {
    if (!probe.wine.manifest) {
      return [missing_manifest_issue(requirement, probe)];
    }

    const hasOption = probe.wine.manifest.groups.some((group) =>
      group.options.some((option) => option.name === requirement.optionName),
    );

    return hasOption
      ? []
      : [create_issue(
          requirement,
          "wine-launch-option-missing",
          `Unsupported Wine runtime: ${probe.wine.manifest.name} does not provide the required ${requirement.optionName} launch option.`,
        )];
  }

  if (requirement.kind === "wine-family") {
    if (!probe.wine.manifest) {
      return [missing_manifest_issue(requirement, probe)];
    }

    const availableFamilies = probe.wine.manifest.wineFamilies ?? [];
    const supportsFamily = requirement.anyOf.some((family) =>
      availableFamilies.includes(family),
    );

    return supportsFamily
      ? []
      : [create_issue(
          requirement,
          "wine-family-unsupported",
          `Unsupported Wine runtime family. Required one of: ${requirement.anyOf.join(", ")}.`,
        )];
  }

  const state = probe.dependencies[requirement.dependency];

  return state?.available
    ? []
    : [create_issue(
        requirement,
        "runtime-dependency-missing",
        state?.error
          ?? `${requirement.label} is required by this execution Strategy.`,
      )];
}

function missing_manifest_issue(
  requirement: ExecutionRequirement,
  probe: ExecutionCapabilityProbe,
): ExecutionAvailabilityIssue {
  return create_issue(
    requirement,
    "wine-manifest-missing",
    `Unsupported Wine runtime: launcher metadata was not found for ${probe.wine.versionId}.`,
  );
}

function create_issue(
  requirement: ExecutionRequirement,
  code: ExecutionAvailabilityIssue["code"],
  message: string,
): ExecutionAvailabilityIssue {
  return {
    code,
    requirementId: requirement.id,
    requirementKind: requirement.kind,
    message,
    remediation: requirement.remediation,
  };
}

function deduplicate_issues(
  issues: readonly ExecutionAvailabilityIssue[],
): ExecutionAvailabilityIssue[] {
  const seen = new Set<string>();

  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.requirementKind}:${issue.message}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
