import type { Mood, StatName } from "@/lib/constants";

export type Stat = {
  user_id: string;
  stat_name: StatName;
  value: number;
  updated_at: string;
};

export type Quest = {
  id: string;
  user_id: string;
  title: string;
  tag: StatName;
  xp_value: number;
  is_daily: boolean;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
};

export type JournalEntry = {
  id: string;
  user_id: string;
  content: string;
  mood: Mood | null;
  created_at: string;
};

export type Habit = {
  id: string;
  title: string;
  tag: StatName;
  xp_value: number;
  is_completed: boolean;
  streak: number;
  completedToday: boolean;
};

export type PlayerProgress = {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForLevel: number;
  xpToNextLevel: number;
  progressPercent: number;
};
