# LifeStats Supabase setup

Apply every SQL migration in timestamp order. For a linked project, use
`supabase db push`; in the SQL Editor, run the initial schema first and then
the character-stat upgrade migration. The upgrade is required for projects
that were created with the original four-stat schema.

The application should call these authenticated RPCs:

- `reset_daily_quests()` before fetching quests on each app load. It returns
  the number of stale daily quests reset for the current user.
- `complete_quest({ p_quest_id: questId })` to update the linked stat atomically.
  Daily habits award XP; one-time quests return zero XP. It returns one row
  with the XP/stat result and total XP.
- `get_my_character_progress()` for total XP and next-level progress values.
- `get_habit_streaks()` for daily-quest streak cards.

`quest_completions` is intentionally an append-only, RPC-written history
table; the streak RPC reads it after a daily quest's visible checkbox is reset.
Quest daily boundaries use UTC.

## Evidence-based check-ins

Apply the evidence and scheduler migrations after the substat migration. Existing
scores, legacy check-ins, and QoL history are preserved; only new check-ins use
evidence-first daily scoring. The old browser-callable `apply_ai_check_in` RPC is
revoked so clients cannot bypass validation or award their own AI scores.

The Next.js backend authenticates with the user's cookie, then uses the server-only
service role to call `save_check_in_evidence`. Do not expose that credential.
Evidence tables are read-only and user-scoped for authenticated clients.
`get_check_in_result` returns saved analysis plus applied daily totals.

`aggregate_due_check_ins()` is service-role/database-job only. It locks each user,
deduplicates activities, excludes ineligible/quest evidence, applies capped daily
changes, recalculates base stats, and records provenance in one transaction.
The immediate-scoring migration runs the same capped, user-locked scorer during
each save, awarding only the increase in the consumed daily allowance. The hourly
job closes days without awarding points twice. Retries do not reapply a closed day.
Previously saved pending evidence is caught up by the migration. Sessions with no eligible evidence still
close without a score penalty. A five-minute grace period and server timestamp
validation prevent in-flight midnight submissions from reopening closed days.

The progress/XP migration adds `ai_check_ins.category_gains`. During each
new save, a user lock protects the before/after substat snapshots and records the
actual sum of applied substat increases for each category in the same transaction. Retries never replace
the original impact. Daily totals remain separate from per-entry gains. Older
entries retain NULL impacts because daily ledgers cannot reliably reconstruct
an individual entry's contribution. Dashboard and Stats sum lifetime
`check_in_daily_scores.applied_change` per category without a display cap; selecting
a category opens individual current scores and cumulative substat points.

A protected ledger trigger credits 1 XP per applied point. Numeric XP storage and
updated `get_my_character_progress` / `complete_quest` return types retain fractional
totals. A unique `(user_id, check_in_day, check_in_substat)` XP identity ensures
ledger updates replace the credited daily amount rather than adding it again.
The migration credits existing applied ledgers once and preserves habit XP.
Overall Level 1 begins at 100 XP; Level 2 remains at 400 XP.

The scheduling migration enables `pg_cron` and installs
`lifestats-check-in-aggregation` at minute 10 of every hour. Check-in days use the
account's fixed IANA timezone, not quest UTC boundaries.

The habit-only XP migration preserves historical XP and stat rewards while
preventing future one-time quest completions from adding XP. The later progress/XP
migration adds protected, ledger-driven check-in XP. Decimal check-in gains use numeric
substat storage and numeric daily ledgers; the shared daily function caps all
sessions' positive evidence at +5 per substat/day. Negative reports never deduct.

Verify after deployment in the Supabase SQL editor:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'lifestats-check-in-aggregation';

select status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (
  select jobid from cron.job where jobname = 'lifestats-check-in-aggregation'
)
order by start_time desc
limit 10;
```

If `pg_cron` is unavailable, the scheduling migration fails explicitly. Do not
enable check-ins until the scheduler is installed or your deployment has an
equivalent trusted hourly job calling `aggregate_due_check_ins()`. Monitor job
failures; saved evidence must not be mistaken for successfully aggregated scores.
Never run deployment tests against personal journal data; the repository's
`npm run test:check-in` uses an isolated database with synthetic records.
