export const BASE_STAT_CONFIG = {
  purpose: {
    label: "Purpose",
    description: "Direction, meaning, and contribution",
    color: "#9162DC",
    dimColor: "#30234A",
    weight: 0.2,
    substats: ["direction", "goals", "values", "meaning", "contribution"],
  },
  vitality: {
    label: "Vitality",
    description: "Health, energy, and wellbeing",
    color: "#5CD68A",
    dimColor: "#1F3A2C",
    weight: 0.2,
    substats: ["fitness", "nutrition", "sleep", "energy", "mental_wellbeing", "intellectual_growth", "emotional_regulation"],
  },
  discipline: {
    label: "Discipline",
    description: "Consistency, routines, and follow-through",
    color: "#F39A36",
    dimColor: "#432D18",
    weight: 0.15,
    substats: ["consistency", "self_control", "focus", "habits", "execution", "initiative", "time_management"],
  },
  social: {
    label: "Social",
    description: "Friends, connection, dating",
    color: "#E04DA8",
    dimColor: "#45233C",
    weight: 0.2,
    substats: ["family", "friends", "communication", "community", "social_life", "social_confidence"],
  },
  finances: {
    label: "Finances",
    description: "Security, career, and financial growth",
    color: "#E0B64D",
    dimColor: "#463B1B",
    weight: 0.2,
    substats: ["income", "saving", "spending", "investing", "financial_security", "career", "professional_growth"],
  },
  environment: {
    label: "Environment",
    description: "Your spaces, experiences, and recreation",
    color: "#4D8DF7",
    dimColor: "#1E3155",
    weight: 0.05,
    substats: ["living_space", "digital_environment", "experiences", "recreation", "hobbies", "nature", "spirituality"],
  },
} as const;

export type StatName = keyof typeof BASE_STAT_CONFIG;
export const STAT_NAMES = Object.keys(BASE_STAT_CONFIG) as StatName[];
export const STAT_META = BASE_STAT_CONFIG;
export type SubstatId = (typeof BASE_STAT_CONFIG)[StatName]["substats"][number];
export const SUBSTAT_META: Record<SubstatId, { label: string; baseStat: StatName; optional?: boolean }> = {
  direction: { label: "Direction", baseStat: "purpose" }, goals: { label: "Goals", baseStat: "purpose" }, values: { label: "Values", baseStat: "purpose" }, meaning: { label: "Meaning", baseStat: "purpose" }, contribution: { label: "Contribution", baseStat: "purpose" },
  fitness: { label: "Fitness", baseStat: "vitality" }, nutrition: { label: "Nutrition", baseStat: "vitality" }, sleep: { label: "Sleep", baseStat: "vitality" }, energy: { label: "Energy", baseStat: "vitality" }, mental_wellbeing: { label: "Mental Well-being", baseStat: "vitality" }, intellectual_growth: { label: "Intellectual Growth", baseStat: "vitality" }, emotional_regulation: { label: "Emotional Regulation", baseStat: "vitality" },
  family: { label: "Family", baseStat: "social" }, friends: { label: "Friends", baseStat: "social" }, communication: { label: "Communication", baseStat: "social" }, community: { label: "Community", baseStat: "social" }, social_life: { label: "Social Life", baseStat: "social" }, social_confidence: { label: "Social Confidence", baseStat: "social" },
  income: { label: "Income", baseStat: "finances" }, saving: { label: "Saving", baseStat: "finances" }, spending: { label: "Spending", baseStat: "finances" }, investing: { label: "Investing", baseStat: "finances" }, financial_security: { label: "Financial Security", baseStat: "finances" }, career: { label: "Career", baseStat: "finances" }, professional_growth: { label: "Professional Growth", baseStat: "finances" },
  consistency: { label: "Consistency", baseStat: "discipline" }, self_control: { label: "Self-Control", baseStat: "discipline" }, focus: { label: "Focus", baseStat: "discipline" }, habits: { label: "Habits", baseStat: "discipline" }, execution: { label: "Execution", baseStat: "discipline" }, initiative: { label: "Initiative", baseStat: "discipline" }, time_management: { label: "Time Management", baseStat: "discipline" },
  living_space: { label: "Living Space", baseStat: "environment" }, digital_environment: { label: "Digital Environment", baseStat: "environment" }, experiences: { label: "Experiences", baseStat: "environment" }, recreation: { label: "Recreation", baseStat: "environment" }, hobbies: { label: "Hobbies", baseStat: "environment" }, nature: { label: "Nature", baseStat: "environment" }, spirituality: { label: "Spirituality", baseStat: "environment", optional: true },
};
export const SUBSTAT_IDS = Object.keys(SUBSTAT_META) as SubstatId[];
export const SPIRITUALITY_LIFE_SCORE_WEIGHT = 0.1;
export type LifeStatsSettings = { spiritualityEnabled: boolean; includeSpiritualityInLifeScore: boolean };
export const DEFAULT_LIFESTATS_SETTINGS: LifeStatsSettings = { spiritualityEnabled: true, includeSpiritualityInLifeScore: false };
export function getActiveSubstats(baseStat: StatName, settings: LifeStatsSettings = DEFAULT_LIFESTATS_SETTINGS) { return BASE_STAT_CONFIG[baseStat].substats.filter((id) => id !== "spirituality" || settings.spiritualityEnabled) as SubstatId[]; }
export function getLifeScoreWeights(settings: LifeStatsSettings = DEFAULT_LIFESTATS_SETTINGS) {
  const coreShare = settings.spiritualityEnabled && settings.includeSpiritualityInLifeScore ? 1 - SPIRITUALITY_LIFE_SCORE_WEIGHT : 1;
  const weights = { spirituality: 0 } as Record<StatName | "spirituality", number>;
  for (const stat of STAT_NAMES) weights[stat] = BASE_STAT_CONFIG[stat].weight * coreShare;
  if (settings.spiritualityEnabled && settings.includeSpiritualityInLifeScore) weights.spirituality = SPIRITUALITY_LIFE_SCORE_WEIGHT;
  return weights;
}

export const MOODS = [
  { value: "great", label: "Great", emoji: "✦" },
  { value: "good", label: "Good", emoji: "◐" },
  { value: "okay", label: "Okay", emoji: "○" },
  { value: "low", label: "Low", emoji: "◔" },
] as const;

export type Mood = (typeof MOODS)[number]["value"];
