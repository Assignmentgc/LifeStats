export const STAT_TONES = ["vitality", "social", "career", "mind"] as const;

export type StatTone = (typeof STAT_TONES)[number];

export const STAT_LABELS: Record<StatTone, string> = {
  vitality: "Vitality",
  social: "Social",
  career: "Career",
  mind: "Mind",
};
