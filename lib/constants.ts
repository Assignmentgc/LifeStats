/** The only core statistics in the LifeStats scoring model. */
export const CORE_STAT_META = {
  health: {
    label: "Health",
    description: "Your physical and emotional wellbeing",
    color: "#5CD68A",
    dimColor: "#1F3A2C",
  },
  intellect: {
    label: "Intellect",
    description: "How you learn, think, and stay mentally sharp",
    color: "#4D8DF7",
    dimColor: "#1E3155",
  },
  progress: {
    label: "Progress",
    description: "Personal growth, follow-through, and productivity",
    color: "#F39A36",
    dimColor: "#432D18",
  },
  social: {
    label: "Social",
    description: "The quality of your relationships and connection",
    color: "#E04DA8",
    dimColor: "#45233C",
  },
  prosperity: {
    label: "Prosperity",
    description: "Your financial health and career momentum",
    color: "#E9C45B",
    dimColor: "#403817",
  },
  purpose: {
    label: "Purpose",
    description: "Meaning, direction, and fulfillment in your life",
    color: "#9162DC",
    dimColor: "#30234A",
  },
} as const;

export const CORE_STAT_KEYS = [
  "health",
  "intellect",
  "progress",
  "social",
  "prosperity",
  "purpose",
] as const;

export type CoreStatKey = (typeof CORE_STAT_KEYS)[number];

/**
 * These are seeded for every person. Additional substats belong to one of
 * these same six cores; adding one never creates another core category.
 */
export const DEFAULT_SUBSTATS = {
  health: ["Sleep", "Exercise", "Nutrition", "Energy", "Mood", "Stress", "Recovery", "Hydration"],
  intellect: [
    "Knowledge",
    "Focus",
    "Memory",
    "Reading",
    "Learning",
    "Critical Thinking",
    "Problem Solving",
    "Curiosity",
  ],
  progress: [
    "Discipline",
    "Habits",
    "Goals",
    "Deep Work",
    "Tasks Completed",
    "Consistency",
    "Time Management",
    "Efficiency",
    "Self-Improvement",
  ],
  social: [
    "Friends",
    "Family",
    "Social Time",
    "Communication",
    "Meaningful Conversations",
    "Social Activities",
    "New Connections",
    "Social Satisfaction",
  ],
  prosperity: [
    "Income",
    "Spending",
    "Savings",
    "Investing",
    "Budgeting",
    "Career Progress",
    "Performance",
    "Projects",
    "Achievements",
    "Opportunities",
  ],
  purpose: [
    "Life Goals",
    "Direction",
    "Values",
    "Fulfillment",
    "Meaningful Activity",
    "Ambition",
    "Contribution",
    "Goal Alignment",
    "Life Satisfaction",
  ],
} as const satisfies Record<CoreStatKey, readonly string[]>;

// Concise aliases used by existing presentation components and quest tags.
export const STAT_META = CORE_STAT_META;
export const STAT_NAMES = CORE_STAT_KEYS;
export type StatName = CoreStatKey;

export const MOODS = [
  { value: "great", label: "Great", emoji: "✦" },
  { value: "good", label: "Good", emoji: "◐" },
  { value: "okay", label: "Okay", emoji: "○" },
  { value: "low", label: "Low", emoji: "◔" },
] as const;

export type Mood = (typeof MOODS)[number]["value"];
