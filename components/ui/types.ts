import { STAT_META, STAT_NAMES, type StatName } from "@/lib/constants";

export const STAT_TONES = STAT_NAMES;
export type StatTone = StatName;
export const STAT_LABELS: Record<StatTone, string> = Object.fromEntries(
  STAT_NAMES.map((name) => [name, STAT_META[name].label]),
) as Record<StatTone, string>;
