# LifeStats Supabase setup

Apply every SQL migration in timestamp order. For a linked project, use
`supabase db push`. In the SQL Editor, run all three files in
`supabase/migrations/` in filename order, including
`20260927000000_life_stat_scoring_model.sql`. That final migration creates the
`capture_my_life_score_snapshot()` and `get_my_life_scores()` RPCs used by the
dashboard. The character-stat upgrade is required for projects that were
created with the original four-stat schema.

The application should call these authenticated RPCs:

- `reset_daily_quests()` before fetching quests on each app load. It returns
  the number of stale daily quests reset for the current user.
- `complete_quest({ p_quest_id: questId })` to award XP and update the linked
  stat atomically. It returns one row with the XP/stat result and total XP.
- `get_my_character_progress()` for total XP and next-level progress values.
- `get_habit_streaks()` for daily-quest streak cards.

`quest_completions` is intentionally an append-only, RPC-written history
table; the streak RPC reads it after a daily quest's visible checkbox is reset.
Daily boundaries use UTC.
