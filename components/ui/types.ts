export const STAT_TONES = [
  "vitality",
  "strength",
  "intellect",
  "discipline",
  "social",
  "purpose",
] as const;

export type StatTone = (typeof STAT_TONES)[number];

export const STAT_LABELS: Record<StatTone, string> = {
  vitality: "Vitality",
  strength: "Strength",
  intellect: "Intellect",
  discipline: "Discipline",
  social: "Social",
  purpose: "Purpose",
};
