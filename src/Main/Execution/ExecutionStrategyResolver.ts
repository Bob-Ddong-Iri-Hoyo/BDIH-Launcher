import type { HoyoGameKind } from "../../Common/Util/BottlePath";
import type {
  BottleLauncherKind,
  InstallBottleLauncherPayload,
  RunBottleExecutablePayload,
} from "../../Common/Types/IPC";
import { GENERIC_WINE_EXECUTION_PROVIDER } from "../Data/GenericWine";
import { GENSHIN_EXECUTION_PROVIDER } from "../Data/Hoyoverse/genshin";
import { HOYOPLAY_EXECUTION_PROVIDER } from "../Data/Hoyoverse/hoyoplay";
import { STARRAIL_EXECUTION_PROVIDER } from "../Data/Hoyoverse/starrail";
import { ZZZ_EXECUTION_PROVIDER } from "../Data/Hoyoverse/zenless-zone-zero";
import { STEAM_EXECUTION_PROVIDER } from "../Data/Steam";
import type { ExecutionStrategyDefinition } from "./ExecutionStrategy";

export interface CurrentRunExecutionClassification {
  hoyoGame?: HoyoGameKind;
  useHoyoOverseer: boolean;
  launcher?: BottleLauncherKind;
}

/**
 * Temporary route resolver. It selects application-owned Strategy instances;
 * ProviderRegistry will replace the current manager-derived classification.
 */
export function resolve_launcher_install_strategy(
  request: InstallBottleLauncherPayload,
): ExecutionStrategyDefinition<InstallBottleLauncherPayload> {
  return request.launcher === "steam"
    ? STEAM_EXECUTION_PROVIDER.strategies.install
    : HOYOPLAY_EXECUTION_PROVIDER.strategies.install;
}

export function resolve_run_executable_strategy(
  request: RunBottleExecutablePayload,
  classification: CurrentRunExecutionClassification,
): ExecutionStrategyDefinition<RunBottleExecutablePayload> {
  if ((request.executionMode ?? "app") === "installer") {
    return GENERIC_WINE_EXECUTION_PROVIDER.strategies.install;
  }

  if (classification.hoyoGame === "genshin") {
    return GENSHIN_EXECUTION_PROVIDER.strategies.launch;
  }

  if (classification.hoyoGame === "hsr") {
    return STARRAIL_EXECUTION_PROVIDER.strategies.launch;
  }

  if (classification.hoyoGame === "zzz") {
    return ZZZ_EXECUTION_PROVIDER.strategies.launch;
  }

  if (classification.useHoyoOverseer || classification.launcher === "hoyoplay") {
    return HOYOPLAY_EXECUTION_PROVIDER.strategies.launch;
  }

  if (classification.launcher === "steam") {
    return STEAM_EXECUTION_PROVIDER.strategies.launch;
  }

  if (request.appId?.startsWith("steam:") === true) {
    return STEAM_EXECUTION_PROVIDER.strategies.launchGame;
  }

  return GENERIC_WINE_EXECUTION_PROVIDER.strategies.launch;
}
