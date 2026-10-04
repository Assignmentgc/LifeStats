import { DEFAULT_LIFESTATS_SETTINGS, STAT_NAMES, type LifeStatsSettings, type StatName, type SubstatId } from "@/lib/constants";
import { getPlayerProgress } from "@/lib/level";
import { createClient } from "@/lib/supabase/server";
import type { Habit, JournalEntry, Quest, Stat, Substat, Todo } from "@/lib/types";
import { buildCheckInTrend, cumulativeCheckInPoints, calculateLifeScore, parseCheckInCategoryGains } from "@/lib/scoring";

export type ChartPoint = { label: string; value: number };
type StatProgressEvent = {
  stat_name: StatName;
  previous_value: number;
  value: number;
  created_at: string;
};

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function dayKey(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function chartDayLabel(date: Date) {
  return date.getUTCDate() === 1 || date.getUTCDay() === 1 ? String(date.getUTCDate()) : "";
}

function daysThisMonth() {
  const start = startOfCurrentMonth();
  const today = new Date();
  const days: Date[] = [];
  for (const day = new Date(start); day <= today; day.setUTCDate(day.getUTCDate() + 1)) {
    days.push(new Date(day));
  }
  return days;
}

function buildMonthlyProgress(stats: Stat[], events: StatProgressEvent[]): Record<StatName, ChartPoint[]> {
  const days = daysThisMonth();
  const eventsByStat = new Map<StatName, StatProgressEvent[]>();
  for (const event of events) {
    const list = eventsByStat.get(event.stat_name) ?? [];
    list.push(event);
    eventsByStat.set(event.stat_name, list);
  }

  return Object.fromEntries(STAT_NAMES.map((statName) => {
    const statEvents = eventsByStat.get(statName) ?? [];
    let value = statEvents[0]?.previous_value ?? stats.find((stat) => stat.stat_name === statName)?.value ?? 0;
    return [statName, days.map((day) => {
      const changes = statEvents.filter((event) => dayKey(event.created_at) === dayKey(day));
      if (changes.length) value = changes.at(-1)?.value ?? value;
      return { label: chartDayLabel(day), value };
    })];
  })) as Record<StatName, ChartPoint[]>;
}

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email_confirmed_at) throw new Error("You must sign in with a verified email to view LifeStats.");
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

function mergeSubstats(userId: string, substats: Substat[] | null): Substat[] {
  return (substats ?? []).map((substat) => ({ ...substat, user_id: userId, substat_id: substat.substat_id as SubstatId }));
}

async function getLifeStatsSettings(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase.from("lifestats_settings").select("spirituality_enabled, include_spirituality_in_life_score").maybeSingle();
  if (error) throw new Error(error.message);
  return { spiritualityEnabled: data?.spirituality_enabled ?? DEFAULT_LIFESTATS_SETTINGS.spiritualityEnabled, includeSpiritualityInLifeScore: data?.include_spirituality_in_life_score ?? DEFAULT_LIFESTATS_SETTINGS.includeSpiritualityInLifeScore } satisfies LifeStatsSettings;
}

export async function getCategoryTrend(stat: StatName) {
  const { supabase } = await getAuthenticatedClient();
  const { data: settings, error: settingsError } = await supabase.from("lifestats_settings").select("check_in_timezone").maybeSingle();
  if (settingsError) throw new Error(`Could not load check-in timezone: ${settingsError.message}`);
  const scores: { local_day: string; substat_id: string; applied_change: number }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("check_in_daily_scores").select("local_day, substat_id, applied_change")
      .order("local_day").order("substat_id").range(offset, offset + 499);
    if (error) throw new Error(`Could not load check-in trend: ${error.message}`);
    scores.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings?.check_in_timezone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return buildCheckInTrend(scores, stat, today);
}

export async function getCurrentLifeStatsSettings() {
  const { supabase } = await getAuthenticatedClient();
  return getLifeStatsSettings(supabase);
}

async function resetStaleDailyQuests() {
  const { supabase } = await getAuthenticatedClient();
  const { error } = await supabase.rpc("reset_daily_quests");
  if (error) throw new Error(`Could not reset daily quests: ${error.message}`);
}

async function getLatestCheckInGains(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase.from("ai_check_ins")
    .select("category_gains").order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw new Error(`Could not load latest check-in gains: ${error.message}`);
  return data ? parseCheckInCategoryGains(data.category_gains) : undefined;
}

async function getCumulativeCheckInPoints(supabase: Awaited<ReturnType<typeof createClient>>) {
  // Page through the ledger so Supabase's row limit cannot truncate lifetime totals.
  const scores: { substat_id: string; applied_change: number }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("check_in_daily_scores").select("substat_id, applied_change")
      .order("local_day").order("substat_id").range(offset, offset + 499);
    if (error) throw new Error(`Could not load cumulative check-in points: ${error.message}`);
    scores.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return cumulativeCheckInPoints(scores);
}

async function getCharacterProgress(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase.rpc("get_my_character_progress");
  if (error) throw new Error(`Could not load XP progress: ${error.message}`);
  const totalXp: unknown = data?.[0]?.total_xp;
  if (typeof totalXp !== "number" || !Number.isFinite(totalXp) || totalXp < 0) {
    throw new Error("Invalid saved XP progress.");
  }
  return getPlayerProgress(totalXp);
}

export async function getStatsData() {
  const { supabase, user } = await getAuthenticatedClient();
  const monthStart = startOfCurrentMonth().toISOString();
  const [statsResult, substatsResult, settings, eventsResult, latestCheckInGains, checkInPoints] = await Promise.all([
    supabase.from("stats").select("*").order("stat_name"),
    supabase.from("stat_subscores").select("*").order("substat_id"),
    getLifeStatsSettings(supabase),
    supabase.from("stat_progress_events").select("stat_name, previous_value, value, created_at").gte("created_at", monthStart).order("created_at"),
    getLatestCheckInGains(supabase),
    getCumulativeCheckInPoints(supabase),
  ]);

  if (statsResult.error || substatsResult.error) throw new Error(statsResult.error?.message ?? substatsResult.error?.message);
  // The history tables arrive with the analytics migration. Never invent a
  // trend: without stored history, the UI explicitly says so instead.
  const historyReady = !eventsResult.error;
  const stats = mergeStats(user.id, statsResult.data as Stat[] | null);
  const events = (eventsResult.data ?? []) as StatProgressEvent[];

  return {
    user,
    // Use the same persisted, user-scoped stats as the dashboard. Demo data is
    // limited to analytics charts, so a preview can never mask real progress.
    stats,
    checkInPoints,
    latestCheckInGains,
    substats: mergeSubstats(user.id, substatsResult.data as Substat[] | null),
    settings,
    lifeScore: calculateLifeScore(Object.fromEntries(stats.map((stat) => [stat.stat_name, stat.value])) as Record<StatName, number>, mergeSubstats(user.id, substatsResult.data as Substat[] | null), settings),
    monthlyProgress: historyReady && events.length ? buildMonthlyProgress(stats, events) : null,
  };
}

export async function getDashboardData() {
  const { supabase, user } = await getAuthenticatedClient();

  const [statsResult, substatsResult, settings, progress, todoResult, latestCheckInGains, checkInPoints] = await Promise.all([
    supabase.from("stats").select("*").order("stat_name"),
    supabase.from("stat_subscores").select("*").order("substat_id"),
    getLifeStatsSettings(supabase),
    getCharacterProgress(supabase),
    supabase.from("todos").select("*").eq("is_completed", false).order("created_at", { ascending: false }).limit(3),
    getLatestCheckInGains(supabase),
    getCumulativeCheckInPoints(supabase),
  ]);

  if (statsResult.error || substatsResult.error) throw new Error(statsResult.error?.message ?? substatsResult.error?.message);
  if (todoResult.error) throw new Error(todoResult.error.message);

  const stats = mergeStats(user.id, statsResult.data as Stat[] | null);
  const substats = mergeSubstats(user.id, substatsResult.data as Substat[] | null);
  return {
    user,
    stats,
    checkInPoints,
    latestCheckInGains,
    substats,
    settings,
    lifeScore: calculateLifeScore(Object.fromEntries(stats.map((stat) => [stat.stat_name, stat.value])) as Record<StatName, number>, substats, settings),
    progress,
    todos: (todoResult.data ?? []) as Todo[],
  };
}

export async function getTodoData() {
  const { supabase } = await getAuthenticatedClient();
  const { data, error } = await supabase.from("todos").select("*").eq("is_completed", false).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Todo[];
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
  const [journalResult, checkInResult] = await Promise.all([
    supabase.from("journal_entries").select("*").order("created_at", { ascending: false }),
    supabase.from("ai_check_ins").select("id, user_id, content, created_at").order("created_at", { ascending: false }),
  ]);
  if (journalResult.error || checkInResult.error) {
    throw new Error(journalResult.error?.message ?? checkInResult.error?.message);
  }
  const entries: JournalEntry[] = [
    ...(journalResult.data ?? []).map((entry) => ({ ...entry, source: "journal" as const })),
    ...(checkInResult.data ?? []).map((entry) => ({ ...entry, mood: null, source: "check-in" as const })),
  ];
  return entries.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
