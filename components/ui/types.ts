export const STAT_TONES = [
  "health",
  "intellect",
  "progress",
  "social",
  "prosperity",
  "purpose",
] as const;

export type StatTone = (typeof STAT_TONES)[number];

export const STAT_LABELS: Record<StatTone, string> = {
  health: "Health",
  intellect: "Intellect",
  progress: "Progress",
  social: "Social",
  prosperity: "Prosperity",
  purpose: "Purpose",
};
