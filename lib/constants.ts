export const STAT_META = {
  vitality: {
    label: "Vitality",
    description: "Energy, health, and recovery",
    color: "#5CD68A",
    dimColor: "#1F3A2C",
  },
  strength: {
    label: "Strength",
    description: "Movement, training, and resilience",
    color: "#EF6262",
    dimColor: "#412329",
  },
  intellect: {
    label: "Intellect",
    description: "Learning, focus, and clear thinking",
    color: "#4D8DF7",
    dimColor: "#1E3155",
  },
  discipline: {
    label: "Discipline",
    description: "Consistency, routines, and follow-through",
    color: "#F39A36",
    dimColor: "#432D18",
  },
  social: {
    label: "Social",
    description: "Friends, connection, dating",
    color: "#E04DA8",
    dimColor: "#45233C",
  },
  purpose: {
    label: "Purpose",
    description: "Goals, meaning, and direction",
    color: "#9162DC",
    dimColor: "#30234A",
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
