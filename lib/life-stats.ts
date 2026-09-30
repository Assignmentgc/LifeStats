import { CORE_STAT_KEYS, type CoreStatKey } from "@/lib/constants";

/** Keep every externally supplied score inside the model's 0–100 range. */
export function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function averageScores(values: readonly number[]) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + clampScore(value), 0) / values.length;
}

/** Life is always the unweighted average of precisely the six core scores. */
export function calculateLifeScore(coreScores: Record<CoreStatKey, number>) {
  return averageScores(CORE_STAT_KEYS.map((core) => coreScores[core]));
}

export function displayScore(score: number) {
  return Math.round(clampScore(score));
}
