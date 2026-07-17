import type {
  ExecutionAvailabilityIssue,
  ExecutionRequirement,
} from "../../../src/Common/Types/Execution";
import type { WineLauncherOptionsManifest } from "../../../src/Common/Types/Wine";
import {
  assess_execution_strategy_availability,
  type ExecutionCapabilityProbe,
  type ExecutionStrategyAvailabilityPolicy,
} from "../../../src/Main/Execution/ExecutionAvailability";
import {
  resolve_run_executable_strategy,
} from "../../../src/Main/Execution/ExecutionStrategyResolver";
import {
  check_bottle_execution_availability,
} from "../../../src/Main/Execution/ExecutionAvailabilityCoordinator";
import { ExecutionStrategyDefinition } from "../../../src/Main/Execution/ExecutionStrategy";
import { GENERIC_WINE_EXECUTION_PROVIDER } from "../../../src/Main/Data/GenericWine";
import { GENSHIN_EXECUTION_PROVIDER } from "../../../src/Main/Data/Hoyoverse/genshin";
import { HOYOPLAY_EXECUTION_PROVIDER } from "../../../src/Main/Data/Hoyoverse/hoyoplay";
import { STARRAIL_EXECUTION_PROVIDER } from "../../../src/Main/Data/Hoyoverse/starrail";
import { ZZZ_EXECUTION_PROVIDER } from "../../../src/Main/Data/Hoyoverse/zenless-zone-zero";
import { STEAM_EXECUTION_PROVIDER } from "../../../src/Main/Data/Steam";

const BASE_REQUIREMENTS: readonly ExecutionRequirement[] = [
  {
    id: "wine.runtime",
    kind: "wine-runtime",
    label: "Wine runtime",
  },
  {
    id: "wine.tool.wine64",
    kind: "wine-tool",
    tool: "wine64",
    label: "wine64",
  },
];

const BASE_POLICY: ExecutionStrategyAvailabilityPolicy<{ bottleId: string }> = {
  providerId: "generic-wine",
  strategyId: "generic-wine.launch",
  operation: "launch",
  requirements: BASE_REQUIREMENTS,
};

describe("Execution Strategy availability", () => {
  it("reports a generic Wine Strategy as available when its requirements are present", async () => {
    const result = await assess_execution_strategy_availability(
      BASE_POLICY,
      { bottleId: "bottle-1" },
      create_probe(),
    );

    expect(result.available).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("reports the missing Wine runtime without duplicating dependent tool errors", async () => {
    const probe = create_probe();

    probe.wine.runtime = {
      available: false,
      error: "Wine runtime is not installed.",
    };
    probe.wine.tools.wine64 = {
      available: false,
      error: "wine64 was not found.",
    };

    const result = await assess_execution_strategy_availability(
      BASE_POLICY,
      { bottleId: "bottle-1" },
      probe,
    );

    expect(result.available).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "wine-runtime-missing",
        message: "Wine runtime is not installed.",
      }),
    ]);
  });

  it("reports a missing Wine manifest capability group", async () => {
    const policy: ExecutionStrategyAvailabilityPolicy<{ bottleId: string }> = {
      ...BASE_POLICY,
      providerId: "hoyoplay",
      strategyId: "hoyoplay.supervised-launch",
      requirements: [
        ...BASE_REQUIREMENTS,
        {
          id: "wine.manifest.group.hoyo-routing",
          kind: "wine-manifest-group",
          groupId: "hoyo-routing",
          label: "HoYo routing",
        },
      ],
    };
    const probe = create_probe({
      manifest: create_manifest(["general"]),
    });
    const result = await assess_execution_strategy_availability(
      policy,
      { bottleId: "bottle-1" },
      probe,
    );

    expect(result.available).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "wine-manifest-group-missing",
        requirementId: "wine.manifest.group.hoyo-routing",
      }),
    ]);
  });

  it("reports a missing external runtime dependency", async () => {
    const policy: ExecutionStrategyAvailabilityPolicy<{ bottleId: string }> = {
      ...BASE_POLICY,
      strategyId: "hoyo:hsr.launch",
      requirements: [
        ...BASE_REQUIREMENTS,
        {
          id: "runtime.jadeite",
          kind: "runtime-dependency",
          dependency: "jadeite",
          label: "Jadeite runtime",
        },
      ],
    };
    const probe = create_probe();

    probe.dependencies.jadeite = {
      available: false,
      error: "jadeite.exe was not found.",
    };

    const result = await assess_execution_strategy_availability(
      policy,
      { bottleId: "bottle-1" },
      probe,
    );

    expect(result.available).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "runtime-dependency-missing",
        message: "jadeite.exe was not found.",
      }),
    ]);
  });

  it("reports a missing execution supervisor", async () => {
    const policy: ExecutionStrategyAvailabilityPolicy<{ bottleId: string }> = {
      ...BASE_POLICY,
      strategyId: "hoyoplay.install",
      operation: "install",
      requirements: [
        ...BASE_REQUIREMENTS,
        {
          id: "supervisor.hoyoplay-overseer",
          kind: "supervisor",
          supervisor: "hoyoplay-overseer",
          label: "HoYoPlay overseer",
        },
      ],
    };
    const probe = create_probe();

    probe.supervisors["hoyoplay-overseer"] = {
      available: false,
      error: "HoYoPlay overseer is not registered.",
    };

    const result = await assess_execution_strategy_availability(
      policy,
      { bottleId: "bottle-1" },
      probe,
    );

    expect(result.available).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "supervisor-missing",
        message: "HoYoPlay overseer is not registered.",
      }),
    ]);
  });

  it("allows a Strategy to append a custom availability issue", async () => {
    const customIssue: ExecutionAvailabilityIssue = {
      code: "strategy-unavailable",
      requirementId: "steam.bootstrap-contract",
      requirementKind: "wine-manifest",
      message: "Steam bootstrap handoff is unavailable.",
    };
    const policy: ExecutionStrategyAvailabilityPolicy<{ bottleId: string }> = {
      ...BASE_POLICY,
      providerId: "steam",
      strategyId: "steam.install",
      checkAvailability: () => [customIssue],
    };
    const result = await assess_execution_strategy_availability(
      policy,
      { bottleId: "bottle-1" },
      create_probe(),
    );

    expect(result.available).toBe(false);
    expect(result.issues).toContainEqual(customIssue);
  });

  it("declares DXMT and Jadeite for the current Star Rail compatibility route", () => {
    const request = {
      bottleId: "bottle-1",
      bottleName: "Bottle 1",
      bottlePath: "/bottles/1",
      wineVersionId: "wine-test",
      executablePath: "C:\\Games\\StarRail.exe",
      appId: "hoyo:hsr",
    };
    const policy = resolve_run_executable_strategy(request, {
      hoyoGame: "hsr",
      useHoyoOverseer: false,
    });
    const requirements = typeof policy.requirements === "function"
      ? policy.requirements(request)
      : policy.requirements;

    expect(policy.providerId).toBe("hoyo:hsr");
    expect(policy.strategyId).toBe("hoyo:hsr.launch");
    expect(requirements.map((requirement) => requirement.id)).toEqual(
      expect.arrayContaining([
        "wine.manifest.group.hoyo-routing",
        "wine.manifest.group.hoyo-network",
        "runtime.dxmt",
        "runtime.jadeite",
      ]),
    );
  });

  it("bundles each Profile with inherited application-owned Strategies", () => {
    const providers = [
      GENERIC_WINE_EXECUTION_PROVIDER,
      STEAM_EXECUTION_PROVIDER,
      HOYOPLAY_EXECUTION_PROVIDER,
      GENSHIN_EXECUTION_PROVIDER,
      STARRAIL_EXECUTION_PROVIDER,
      ZZZ_EXECUTION_PROVIDER,
    ];

    for (const provider of providers) {
      expect(provider.profile.id).toBeTruthy();

      for (const strategy of Object.values(provider.strategies)) {
        expect(strategy).toBeInstanceOf(ExecutionStrategyDefinition);
        expect(strategy.providerId).toBeTruthy();
        expect(strategy.strategyId).toBeTruthy();
      }
    }
  });

  it("emits checking and unavailable with the same check ID", async () => {
    const events: Array<{ checkId: string; status: string }> = [];
    const request = {
      bottleId: "bottle-1",
      appId: "manual-app",
      wineVersionId: "wine-missing",
    };
    const policy: ExecutionStrategyAvailabilityPolicy<typeof request> = {
      providerId: "generic-wine",
      strategyId: "generic-wine.launch",
      operation: "launch",
      requirements: BASE_REQUIREMENTS,
    };
    const result = await check_bottle_execution_availability({
      request,
      policy,
      inspector: {
        inspectWineRuntime: () => ({
          available: false,
          error: "Wine runtime is missing.",
        }),
        inspectWineTool: () => ({
          available: false,
          error: "Wine tool is missing.",
        }),
        readWineManifest: () => undefined,
        inspectDependency: () => ({ available: true }),
        inspectSupervisor: () => ({ available: true }),
      },
      emit: (event) => events.push(event),
    });

    expect(events.map((event) => event.status)).toEqual([
      "checking",
      "unavailable",
    ]);
    expect(events[0]?.checkId).toBe(events[1]?.checkId);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "wine-runtime-missing",
        message: "Wine runtime is missing.",
      }),
    ]);
  });
});

function create_probe(options?: {
  manifest?: WineLauncherOptionsManifest;
}): ExecutionCapabilityProbe {
  return {
    wine: {
      versionId: "wine-test",
      runtimePath: "/runtime/wine-test",
      runtime: {
        available: true,
        value: "/runtime/wine-test",
      },
      tools: {
        wine64: {
          available: true,
          value: "/runtime/wine-test/bin/wine64",
        },
      },
      manifest: options?.manifest,
    },
    dependencies: {},
    supervisors: {},
  };
}

function create_manifest(groupIds: string[]): WineLauncherOptionsManifest {
  return {
    schemaVersion: 1,
    id: "test.manifest",
    name: "Test Wine",
    groups: groupIds.map((id) => ({
      id,
      title: id,
      options: [
        {
          name: `${id}.enabled`,
          type: "boolean",
        },
      ],
    })),
  };
}
