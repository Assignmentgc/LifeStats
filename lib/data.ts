import { CORE_STAT_KEYS, type CoreStatKey, type StatName } from "@/lib/constants";
import { getPlayerProgress } from "@/lib/level";
import { createClient } from "@/lib/supabase/server";
import type { CoreStat, Habit, JournalEntry, LifeStats, Quest, Substat } from "@/lib/types";

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("You must be signed in to view LifeStats.");
  return { supabase, user };
}

async function resetStaleDailyQuests() {
  const { supabase } = await getAuthenticatedClient();
  const { error } = await supabase.rpc("reset_daily_quests");
  if (error) throw new Error(`Could not reset daily quests: ${error.message}`);
}

type LifeScoreRow = {
  score_type: "life" | "core" | "substat";
  core_stat: CoreStatKey | null;
  substat_id: string | null;
  substat_name: string | null;
  score: number | string;
  measurement_count: number | string;
};

function numericValue(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildLifeStats(rows: LifeScoreRow[] | null): LifeStats {
  const scoreRows = rows ?? [];
  const substats = scoreRows.flatMap((row): Substat[] => {
    if (row.score_type !== "substat" || !row.core_stat || !row.substat_id || !row.substat_name) {
      return [];
    }
    return [{
      id: row.substat_id,
      core_stat: row.core_stat,
      name: row.substat_name,
      score: numericValue(row.score),
      measurement_count: numericValue(row.measurement_count),
    }];
  });

  const coreStats: CoreStat[] = CORE_STAT_KEYS.map((key) => {
    const coreRow = scoreRows.find(
      (row) => row.score_type === "core" && row.core_stat === key,
    );
    return {
      key,
      score: numericValue(coreRow?.score),
      substats: substats.filter((substat) => substat.core_stat === key),
    };
  });

  return {
    lifeScore: numericValue(scoreRows.find((row) => row.score_type === "life")?.score),
    coreStats,
  };
}

async function getLifeStatsForAuthenticatedUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { error: snapshotError } = await supabase.rpc("capture_my_life_score_snapshot");
  if (snapshotError) throw new Error(snapshotError.message);

  const { data, error } = await supabase.rpc("get_my_life_scores");
  if (error) throw new Error(error.message);
  return buildLifeStats(data as LifeScoreRow[] | null);
}

export async function getLifeStatsData() {
  const { supabase } = await getAuthenticatedClient();
  return getLifeStatsForAuthenticatedUser(supabase);
}

export async function getDashboardData() {
  const { supabase, user } = await getAuthenticatedClient();
  await resetStaleDailyQuests();

  const [lifeStats, questResult, xpResult] = await Promise.all([
    getLifeStatsForAuthenticatedUser(supabase),
    supabase
      .from("quests")
      .select("*")
      .order("is_completed", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("xp_log").select("amount"),
  ]);

  if (questResult.error) throw new Error(questResult.error.message);
  if (xpResult.error) throw new Error(xpResult.error.message);

  const totalXp = (xpResult.data ?? []).reduce(
    (total, item) => total + Number(item.amount),
    0,
  );

  return {
    user,
    lifeStats,
    quests: (questResult.data ?? []) as Quest[],
    progress: getPlayerProgress(totalXp),
  };
}

export async function getQuestData() {
  const { supabase } = await getAuthenticatedClient();
  await resetStaleDailyQuests();

  const { data, error } = await supabase
    .from("quests")
    .select("*")
    .order("is_completed", { ascending: true })
    .order("is_daily", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return {
    quests: (data ?? []) as Quest[],
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
    .select("quest_id, completed_on")
    .in(
      "quest_id",
      dailyQuests.map((quest) => quest.id),
    );

  if (completionError) throw new Error(completionError.message);

  const datesByQuest = new Map<string, string[]>();
  for (const completion of completions ?? []) {
    const dates = datesByQuest.get(completion.quest_id) ?? [];
    dates.push(completion.completed_on);
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
