import { getActiveSubstats, getLifeScoreWeights, STAT_NAMES, SUBSTAT_META, type LifeStatsSettings, type StatName, type SubstatId } from "@/lib/constants";

export type SubstatScore = { substat_id: SubstatId; value: number };

export function calculateBaseStatScore(baseStat: StatName, scores: SubstatScore[], settings: LifeStatsSettings) {
  const active = new Set(getActiveSubstats(baseStat, settings));
  const values = scores.filter((score) => active.has(score.substat_id)).map((score) => score.value);
  return values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : 0;
}

export function parseCheckInCategoryGains(value: unknown): Record<StatName, number> | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid saved check-in gains.");
  const gains = Object.fromEntries(STAT_NAMES.map((stat) => {
    const gain: unknown = Reflect.get(value, stat);
    if (typeof gain !== "number" || !Number.isFinite(gain) || gain < 0) {
      throw new Error("Invalid saved check-in gains.");
    }
    return [stat, gain];
  }));
  return gains as Record<StatName, number>;
}

export function cumulativeCheckInPoints(scores: { substat_id: string; applied_change: number }[]) {
  const categories = Object.fromEntries(STAT_NAMES.map((stat) => [stat, 0])) as Record<StatName, number>;
  const substats: Partial<Record<SubstatId, number>> = {};
  for (const score of scores) {
    if (!Object.hasOwn(SUBSTAT_META, score.substat_id) || !Number.isFinite(score.applied_change) || score.applied_change < 0) {
      throw new Error("Invalid saved cumulative check-in points.");
    }
    const id = score.substat_id as SubstatId;
    substats[id] = (substats[id] ?? 0) + score.applied_change;
    categories[SUBSTAT_META[id].baseStat] += score.applied_change;
  }
  return { categories, substats };
}

export type TrendPoint = { day: string; value: number };

function shiftDay(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

// Running total of applied check-in points for one base stat, one point per local day.
export function buildCheckInTrend(
  scores: { local_day: string; substat_id: string; applied_change: number }[],
  stat: StatName, endDay: string, days = 30,
) {
  const startDay = shiftDay(endDay, 1 - days);
  const daily = new Map<string, number>();
  let baseline = 0;
  for (const score of scores) {
    if (!Object.hasOwn(SUBSTAT_META, score.substat_id) || !Number.isFinite(score.applied_change) || score.applied_change < 0) {
      throw new Error("Invalid saved cumulative check-in points.");
    }
    if (SUBSTAT_META[score.substat_id as SubstatId].baseStat !== stat || score.local_day > endDay) continue;
    if (score.local_day < startDay) baseline += score.applied_change;
    else daily.set(score.local_day, (daily.get(score.local_day) ?? 0) + score.applied_change);
  }
  let running = baseline;
  const points: TrendPoint[] = Array.from({ length: days }, (_, index) => {
    const day = shiftDay(startDay, index);
    running += daily.get(day) ?? 0;
    return { day, value: running };
  });
  return { points, gained: running - baseline, total: running };
}

export function calculateLifeScore(baseScores: Record<StatName, number>, substatScores: SubstatScore[], settings: LifeStatsSettings) {
  const weights = getLifeScoreWeights(settings);
  const spirituality = substatScores.find((score) => score.substat_id === "spirituality")?.value ?? 0;
  return Math.round((Object.keys(baseScores) as StatName[]).reduce((total, stat) => total + baseScores[stat] * weights[stat], 0) + spirituality * weights.spirituality);
}
