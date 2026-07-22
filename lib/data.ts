import { STAT_NAMES, type StatName } from "@/lib/constants";
import { getPlayerProgress } from "@/lib/level";
import { createClient } from "@/lib/supabase/server";
import type { Habit, JournalEntry, Quest, Stat } from "@/lib/types";

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("You must be signed in to view LifeStats.");
  return { supabase, user };
}

function getDefaultStats(userId: string): Stat[] {
  return STAT_NAMES.map((statName) => ({
    user_id: userId,
    stat_name: statName,
    value: 0,
    updated_at: new Date(0).toISOString(),
  }));
}

function mergeStats(userId: string, stats: Stat[] | null): Stat[] {
  const byName = new Map((stats ?? []).map((stat) => [stat.stat_name, stat]));
  return getDefaultStats(userId).map((fallback) => byName.get(fallback.stat_name) ?? fallback);
}

async function resetStaleDailyQuests() {
  const { supabase } = await getAuthenticatedClient();
  const { error } = await supabase.rpc("reset_daily_quests");
  if (error) throw new Error(`Could not reset daily quests: ${error.message}`);
}

export async function getDashboardData() {
  const { supabase, user } = await getAuthenticatedClient();
  await resetStaleDailyQuests();

  const [statsResult, questResult, xpResult] = await Promise.all([
    supabase.from("stats").select("*").order("stat_name"),
    supabase
      .from("quests")
      .select("*")
      .order("is_completed", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("xp_log").select("amount"),
  ]);

  if (statsResult.error) throw new Error(statsResult.error.message);
  if (questResult.error) throw new Error(questResult.error.message);
  if (xpResult.error) throw new Error(xpResult.error.message);

  const totalXp = (xpResult.data ?? []).reduce(
    (total, item) => total + Number(item.amount),
    0,
  );

  return {
    user,
    stats: mergeStats(user.id, statsResult.data as Stat[] | null),
    quests: (questResult.data ?? []) as Quest[],
    progress: getPlayerProgress(totalXp),
  };
}

export async function getQuestData() {
  const { supabase, user } = await getAuthenticatedClient();
  await resetStaleDailyQuests();

  const [statsResult, questResult] = await Promise.all([
    supabase.from("stats").select("*").order("stat_name"),
    supabase
      .from("quests")
      .select("*")
      .order("is_completed", { ascending: true })
      .order("is_daily", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (statsResult.error) throw new Error(statsResult.error.message);
  if (questResult.error) throw new Error(questResult.error.message);

  return {
    stats: mergeStats(user.id, statsResult.data as Stat[] | null),
    quests: (questResult.data ?? []) as Quest[],
  };
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function previousDay(date: Date) {
  const previous = new Date(date);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous;
}

function calculateStreak(completionDates: string[]) {
  const completed = new Set(completionDates);
  const today = new Date();
  let cursor = today;

  // A streak remains live until the current day is over, even if today's quest isn't done yet.
  if (!completed.has(dateKey(cursor))) cursor = previousDay(cursor);
  if (!completed.has(dateKey(cursor))) return 0;

  let streak = 0;
  while (completed.has(dateKey(cursor))) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

export async function getHabitData() {
  const { supabase } = await getAuthenticatedClient();
  await resetStaleDailyQuests();

  const { data: quests, error: questError } = await supabase
    .from("quests")
    .select("*")
    .eq("is_daily", true)
    .order("created_at", { ascending: false });

  if (questError) throw new Error(questError.message);

  const dailyQuests = (quests ?? []) as Quest[];
  if (!dailyQuests.length) return [] as Habit[];

  const { data: completions, error: completionError } = await supabase
    .from("quest_completions")
    .select("quest_id, completion_date")
    .in(
      "quest_id",
      dailyQuests.map((quest) => quest.id),
    );

  if (completionError) throw new Error(completionError.message);

  const datesByQuest = new Map<string, string[]>();
  for (const completion of completions ?? []) {
    const dates = datesByQuest.get(completion.quest_id) ?? [];
    dates.push(completion.completion_date);
    datesByQuest.set(completion.quest_id, dates);
  }

  const today = dateKey(new Date());
  return dailyQuests.map((quest) => {
    const dates = datesByQuest.get(quest.id) ?? [];
    return {
      id: quest.id,
      title: quest.title,
      tag: quest.tag as StatName,
      xp_value: quest.xp_value,
      is_completed: quest.is_completed,
      completedToday: dates.includes(today),
      streak: calculateStreak(dates),
    };
  });
}

export async function getJournalEntries() {
  const { supabase } = await getAuthenticatedClient();
  const { data, error } = await supabase
    .from("journal_entries")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as JournalEntry[];
}
