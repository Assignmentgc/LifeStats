export const STAT_META = {
  vitality: {
    label: "Vitality",
    description: "Sleep, movement, food",
    color: "#5CD68A",
    dimColor: "#1F3A2C",
  },
  social: {
    label: "Social",
    description: "Friends, connection, dating",
    color: "#4CC2E8",
    dimColor: "#1B3644",
  },
  career: {
    label: "Career",
    description: "Work, skills, money",
    color: "#F0A93C",
    dimColor: "#3A2E17",
  },
  mind: {
    label: "Mind",
    description: "Learning, reflection, calm",
    color: "#B98BE0",
    dimColor: "#302345",
  },
} as const;

export const STAT_NAMES = Object.keys(STAT_META) as StatName[];

export type StatName = keyof typeof STAT_META;

export const MOODS = [
  { value: "great", label: "Great", emoji: "✦" },
  { value: "good", label: "Good", emoji: "◐" },
  { value: "okay", label: "Okay", emoji: "○" },
  { value: "low", label: "Low", emoji: "◔" },
] as const;

export type Mood = (typeof MOODS)[number]["value"];
