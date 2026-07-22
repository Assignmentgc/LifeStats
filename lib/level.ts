import type { PlayerProgress } from "@/lib/types";

/** The game progression rule: level = floor(sqrt(total XP / 100)). */
export function getPlayerProgress(totalXp: number): PlayerProgress {
  const safeXp = Math.max(0, totalXp);
  const level = Math.floor(Math.sqrt(safeXp / 100));
  const currentLevelFloor = level ** 2 * 100;
  const nextLevelFloor = (level + 1) ** 2 * 100;
  const xpIntoLevel = safeXp - currentLevelFloor;
  const xpForLevel = nextLevelFloor - currentLevelFloor;

  return {
    totalXp: safeXp,
    level,
    xpIntoLevel,
    xpForLevel,
    xpToNextLevel: nextLevelFloor - safeXp,
    progressPercent: Math.min(100, Math.round((xpIntoLevel / xpForLevel) * 100)),
  };
}
