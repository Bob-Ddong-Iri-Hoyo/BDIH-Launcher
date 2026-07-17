export type ExecutionOperation = "launch" | "install" | "repair" | "uninstall";

export type ExecutionAvailabilityStatus = "checking" | "available" | "unavailable";

export type ExecutionWineTool = "wine64" | "wineboot" | "wineserver";

export type ExecutionRuntimeDependency = "dxmt" | "jadeite";

export type ExecutionSupervisor = "steam-session" | "hoyoplay-overseer";

interface ExecutionRequirementBase {
  id: string;
  label: string;
  remediation?: string;
}

export type ExecutionRequirement =
  | (ExecutionRequirementBase & {
      kind: "wine-runtime";
    })
  | (ExecutionRequirementBase & {
      kind: "wine-tool";
      tool: ExecutionWineTool;
    })
  | (ExecutionRequirementBase & {
      kind: "wine-manifest";
    })
  | (ExecutionRequirementBase & {
      kind: "wine-manifest-group";
      groupId: string;
    })
  | (ExecutionRequirementBase & {
      kind: "wine-launch-option";
      optionName: string;
    })
  | (ExecutionRequirementBase & {
      kind: "wine-family";
      anyOf: string[];
    })
  | (ExecutionRequirementBase & {
      kind: "runtime-dependency";
      dependency: ExecutionRuntimeDependency;
    })
  | (ExecutionRequirementBase & {
      kind: "supervisor";
      supervisor: ExecutionSupervisor;
    });

export type ExecutionAvailabilityIssueCode =
  | "wine-runtime-missing"
  | "wine-tool-missing"
  | "wine-manifest-missing"
  | "wine-manifest-group-missing"
  | "wine-launch-option-missing"
  | "wine-family-unsupported"
  | "runtime-dependency-missing"
  | "supervisor-missing"
  | "strategy-unavailable";

export interface ExecutionAvailabilityIssue {
  code: ExecutionAvailabilityIssueCode;
  requirementId: string;
  requirementKind: ExecutionRequirement["kind"];
  message: string;
  remediation?: string;
}
