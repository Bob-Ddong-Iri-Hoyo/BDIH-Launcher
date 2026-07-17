import type { ExecutionProviderDefinition } from "../../Execution/ExecutionStrategy";
import { STEAM_LAUNCHER_PROFILE } from "./profile";
import {
  STEAM_GAME_LAUNCH_STRATEGY,
  STEAM_INSTALL_STRATEGY,
  STEAM_LAUNCH_STRATEGY,
} from "./strategy";

export const STEAM_EXECUTION_PROVIDER = {
  profile: STEAM_LAUNCHER_PROFILE,
  strategies: {
    install: STEAM_INSTALL_STRATEGY,
    launch: STEAM_LAUNCH_STRATEGY,
    launchGame: STEAM_GAME_LAUNCH_STRATEGY,
  },
} satisfies ExecutionProviderDefinition<
  typeof STEAM_LAUNCHER_PROFILE,
  {
    install: typeof STEAM_INSTALL_STRATEGY;
    launch: typeof STEAM_LAUNCH_STRATEGY;
    launchGame: typeof STEAM_GAME_LAUNCH_STRATEGY;
  }
>;
