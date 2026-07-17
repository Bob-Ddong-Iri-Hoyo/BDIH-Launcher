import type {
  ExecutionRequirement,
  ExecutionWineTool,
} from "../../../Common/Types/Execution";

export function base_wine_strategy_requirements(): ExecutionRequirement[] {
  return [
    {
      id: "wine.runtime",
      kind: "wine-runtime",
      label: "Installed Wine runtime",
      remediation: "Install or select a Wine runtime before launching.",
    },
    wine_tool_requirement("wine64"),
    wine_tool_requirement("wineboot"),
  ];
}

export function wine_tool_requirement(tool: ExecutionWineTool): ExecutionRequirement {
  return {
    id: `wine.tool.${tool}`,
    kind: "wine-tool",
    tool,
    label: `Wine ${tool} executable`,
    remediation: "Reinstall the selected Wine runtime or choose a compatible runtime.",
  };
}

export function hoyo_manifest_group_requirement(groupId: string): ExecutionRequirement {
  return {
    id: `wine.manifest.group.${groupId}`,
    kind: "wine-manifest-group",
    groupId,
    label: `Wine ${groupId} capability group`,
    remediation: "Select a BDHI Wine runtime that declares the required HoYo capability groups.",
  };
}

export function dxmt_strategy_requirement(): ExecutionRequirement {
  return {
    id: "runtime.dxmt",
    kind: "runtime-dependency",
    dependency: "dxmt",
    label: "DXMT runtime",
    remediation: "Download or reselect the DXMT runtime configured for this Bottle.",
  };
}

export function jadeite_strategy_requirement(): ExecutionRequirement {
  return {
    id: "runtime.jadeite",
    kind: "runtime-dependency",
    dependency: "jadeite",
    label: "Jadeite runtime",
    remediation: "Install Jadeite before launching Honkai: Star Rail.",
  };
}
