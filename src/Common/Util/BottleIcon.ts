export const BOTTLE_ICON_IDS = [
  "icon1",
  "icon2",
  "icon3",
  "icon4",
  "icon5",
  "icon6",
  "icon7",
  "icon8",
  "icon10",
  "icon11",
  "icon12",
  "icon13",
] as const;

export type BottleIconId = typeof BOTTLE_ICON_IDS[number];

interface BottleIconCarrier {
  id: string;
  bottleIconId?: string;
}

export function is_bottle_icon_id(value: unknown): value is BottleIconId {
  return typeof value === "string" && BOTTLE_ICON_IDS.includes(value as BottleIconId);
}

function bottle_icon_seed(value: string): number {
  let hash = 2_166_136_261;

  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

export function pick_bottle_icon_id(
  bottles: readonly BottleIconCarrier[],
  seed: string,
): BottleIconId {
  const usage = new Map<BottleIconId, number>(BOTTLE_ICON_IDS.map((iconId) => [iconId, 0]));

  for (const bottle of bottles) {
    if (is_bottle_icon_id(bottle.bottleIconId)) {
      usage.set(bottle.bottleIconId, (usage.get(bottle.bottleIconId) ?? 0) + 1);
    }
  }

  const startIndex = bottle_icon_seed(seed) % BOTTLE_ICON_IDS.length;
  let selectedIconId = BOTTLE_ICON_IDS[startIndex];

  for (let offset = 1; offset < BOTTLE_ICON_IDS.length; offset += 1) {
    const candidateIconId = BOTTLE_ICON_IDS[(startIndex + offset) % BOTTLE_ICON_IDS.length];

    if ((usage.get(candidateIconId) ?? 0) < (usage.get(selectedIconId) ?? 0)) {
      selectedIconId = candidateIconId;
    }

    if ((usage.get(selectedIconId) ?? 0) === 0) {
      break;
    }
  }

  return selectedIconId;
}

export function assign_missing_bottle_icon_ids<T extends BottleIconCarrier>(
  bottles: readonly T[],
): Array<T & { bottleIconId: BottleIconId }> {
  const assigned: Array<T & { bottleIconId: BottleIconId }> = [];

  for (const bottle of bottles) {
    const bottleIconId = is_bottle_icon_id(bottle.bottleIconId)
      ? bottle.bottleIconId
      : pick_bottle_icon_id(assigned, bottle.id);
    assigned.push({ ...bottle, bottleIconId });
  }

  return assigned;
}
