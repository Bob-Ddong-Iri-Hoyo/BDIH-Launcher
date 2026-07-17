import type { ExecutionProviderDefinition } from "../../../Execution/ExecutionStrategy";
import { STARRAIL_HOYO_GAME_PROFILE } from "./profile";
import { STARRAIL_EXECUTION_STRATEGY } from "./strategy";

export const STARRAIL_EXECUTION_PROVIDER = {
  profile: STARRAIL_HOYO_GAME_PROFILE,
  strategies: {
    launch: STARRAIL_EXECUTION_STRATEGY,
  },
} satisfies ExecutionProviderDefinition<
  typeof STARRAIL_HOYO_GAME_PROFILE,
  { launch: typeof STARRAIL_EXECUTION_STRATEGY }
>;
