import type { ExecutionProviderDefinition } from "../../../Execution/ExecutionStrategy";
import { HOYOPLAY_LAUNCHER_PROFILE } from "./profile";
import {
  HOYOPLAY_INSTALL_STRATEGY,
  HOYOPLAY_SUPERVISED_LAUNCH_STRATEGY,
} from "./strategy";

export const HOYOPLAY_EXECUTION_PROVIDER = {
  profile: HOYOPLAY_LAUNCHER_PROFILE,
  strategies: {
    install: HOYOPLAY_INSTALL_STRATEGY,
    launch: HOYOPLAY_SUPERVISED_LAUNCH_STRATEGY,
  },
} satisfies ExecutionProviderDefinition<
  typeof HOYOPLAY_LAUNCHER_PROFILE,
  {
    install: typeof HOYOPLAY_INSTALL_STRATEGY;
    launch: typeof HOYOPLAY_SUPERVISED_LAUNCH_STRATEGY;
  }
>;
