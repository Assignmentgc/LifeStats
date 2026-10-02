import type { Mood, StatName, SubstatId } from "@/lib/constants";

export type Stat = {
  user_id: string;
  stat_name: StatName;
  value: number;
  updated_at: string;
};

export type Substat = {
  user_id: string;
  substat_id: SubstatId;
  value: number;
  updated_at: string;
};

export type Quest = {
  id: string;
  user_id: string;
  title: string;
  tag: StatName;
  substat_id?: SubstatId | null;
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

export type Todo = {
  id: string;
  user_id: string;
  title: string;
  category: import("@/lib/todos").TodoCategory;
  is_completed: boolean;
  created_at: string;
  completed_at: string | null;
};
