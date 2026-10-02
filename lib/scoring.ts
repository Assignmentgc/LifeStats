import { getActiveSubstats, getLifeScoreWeights, type LifeStatsSettings, type StatName, type SubstatId } from "@/lib/constants";

export type SubstatScore = { substat_id: SubstatId; value: number };

export function calculateBaseStatScore(baseStat: StatName, scores: SubstatScore[], settings: LifeStatsSettings) {
  const active = new Set(getActiveSubstats(baseStat, settings));
  const values = scores.filter((score) => active.has(score.substat_id)).map((score) => score.value);
  return values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : 0;
}

export function calculateLifeScore(baseScores: Record<StatName, number>, substatScores: SubstatScore[], settings: LifeStatsSettings) {
  const weights = getLifeScoreWeights(settings);
  const spirituality = substatScores.find((score) => score.substat_id === "spirituality")?.value ?? 0;
  return Math.round((Object.keys(baseScores) as StatName[]).reduce((total, stat) => total + baseScores[stat] * weights[stat], 0) + spirituality * weights.spirituality);
}
