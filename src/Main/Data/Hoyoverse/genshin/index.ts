import type { ExecutionProviderDefinition } from "../../../Execution/ExecutionStrategy";
import { GENSHIN_HOYO_GAME_PROFILE } from "./profile";
import { GENSHIN_EXECUTION_STRATEGY } from "./strategy";

export const GENSHIN_EXECUTION_PROVIDER = {
  profile: GENSHIN_HOYO_GAME_PROFILE,
  strategies: {
    launch: GENSHIN_EXECUTION_STRATEGY,
  },
} satisfies ExecutionProviderDefinition<
  typeof GENSHIN_HOYO_GAME_PROFILE,
  { launch: typeof GENSHIN_EXECUTION_STRATEGY }
>;
