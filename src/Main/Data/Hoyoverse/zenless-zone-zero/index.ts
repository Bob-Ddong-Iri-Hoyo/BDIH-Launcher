import type { ExecutionProviderDefinition } from "../../../Execution/ExecutionStrategy";
import { ZZZ_HOYO_GAME_PROFILE } from "./profile";
import { ZZZ_EXECUTION_STRATEGY } from "./strategy";

export const ZZZ_EXECUTION_PROVIDER = {
  profile: ZZZ_HOYO_GAME_PROFILE,
  strategies: {
    launch: ZZZ_EXECUTION_STRATEGY,
  },
} satisfies ExecutionProviderDefinition<
  typeof ZZZ_HOYO_GAME_PROFILE,
  { launch: typeof ZZZ_EXECUTION_STRATEGY }
>;
