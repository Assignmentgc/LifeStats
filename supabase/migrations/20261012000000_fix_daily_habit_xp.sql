-- Habits are always worth the same fixed daily reward. Existing daily habits
-- are normalized so future completions use the same rule.
update public.quests
set xp_value = 10
where is_daily and xp_value <> 10;

alter table public.quests
  add constraint quests_daily_habits_fixed_xp
  check (not is_daily or xp_value = 10);
