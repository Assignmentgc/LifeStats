# LifeStats Supabase setup

Run the SQL migration in `migrations/20260722000000_lifestats_schema.sql` in
the Supabase SQL Editor, or apply it through the Supabase CLI with
`supabase db push` after linking the project.

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
