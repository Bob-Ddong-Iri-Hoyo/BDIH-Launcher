import type { ExecutionProviderDefinition } from "../../Execution/ExecutionStrategy";
import { GENERIC_WINE_PROFILE } from "./profile";
import {
  GENERIC_WINE_INSTALL_STRATEGY,
  GENERIC_WINE_LAUNCH_STRATEGY,
} from "./strategy";

export const GENERIC_WINE_EXECUTION_PROVIDER = {
  profile: GENERIC_WINE_PROFILE,
  strategies: {
    launch: GENERIC_WINE_LAUNCH_STRATEGY,
    install: GENERIC_WINE_INSTALL_STRATEGY,
  },
} satisfies ExecutionProviderDefinition<
  typeof GENERIC_WINE_PROFILE,
  {
    launch: typeof GENERIC_WINE_LAUNCH_STRATEGY;
    install: typeof GENERIC_WINE_INSTALL_STRATEGY;
  }
>;
