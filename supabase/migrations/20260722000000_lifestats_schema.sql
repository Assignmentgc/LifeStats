-- LifeStats initial schema
--
-- Daily quest days are evaluated in UTC. Call public.reset_daily_quests()
-- after an authenticated app load, before reading the quest list. The
-- complete_quest RPC also performs this reset as part of its transaction.

begin;

create type public.stat_tag as enum ('vitality', 'social', 'career', 'mind');

create table public.stats (
  user_id uuid not null references auth.users (id) on delete cascade,
  stat_name public.stat_tag not null,
  value integer not null default 0 check (value between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, stat_name)
);

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  tag public.stat_tag not null,
  xp_value integer not null default 10 check (xp_value between 1 and 1000),
  is_daily boolean not null default false,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint completed_quests_have_a_timestamp
    check (not is_completed or completed_at is not null)
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 10000),
  mood text check (mood is null or char_length(btrim(mood)) between 1 and 32),
  created_at timestamptz not null default now()
);

create table public.quest_completions (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  completed_at timestamptz not null default now(),
  completed_on date not null,
  xp_awarded integer not null check (xp_awarded > 0),
  stat_gain integer not null check (stat_gain >= 0),
  unique (quest_id, completed_on)
);

create table public.xp_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null check (amount > 0),
  source text not null check (char_length(btrim(source)) between 1 and 200),
  quest_id uuid references public.quests (id) on delete set null,
  created_at timestamptz not null default now()
);

create index quests_user_status_created_idx
  on public.quests (user_id, is_completed, created_at desc);

create index quests_user_daily_idx
  on public.quests (user_id, is_daily)
  where is_daily;

create index journal_entries_user_created_idx
  on public.journal_entries (user_id, created_at desc);

create index quest_completions_user_quest_date_idx
  on public.quest_completions (user_id, quest_id, completed_on desc);

create index xp_log_user_created_idx
  on public.xp_log (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_stats_updated_at
before update on public.stats
for each row execute procedure public.set_updated_at();

create trigger set_quests_updated_at
before update on public.quests
for each row execute procedure public.set_updated_at();

-- Every newly-created Auth user begins with all four stats at zero.
create or replace function public.seed_stats_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.stats (user_id, stat_name, value)
  values
    (new.id, 'vitality'::public.stat_tag, 0),
    (new.id, 'social'::public.stat_tag, 0),
    (new.id, 'career'::public.stat_tag, 0),
    (new.id, 'mind'::public.stat_tag, 0)
  on conflict (user_id, stat_name) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created_seed_lifestats
after insert on auth.users
for each row execute procedure public.seed_stats_for_new_user();

-- Safe to keep when applying to a project that already has Auth users.
insert into public.stats (user_id, stat_name, value)
select auth_user.id, stat.stat_name, 0
from auth.users as auth_user
cross join (
  values
    ('vitality'::public.stat_tag),
    ('social'::public.stat_tag),
    ('career'::public.stat_tag),
    ('mind'::public.stat_tag)
) as stat(stat_name)
on conflict (user_id, stat_name) do nothing;

alter table public.stats enable row level security;
alter table public.quests enable row level security;
alter table public.journal_entries enable row level security;
alter table public.quest_completions enable row level security;
alter table public.xp_log enable row level security;

-- Explicit grants keep integrity-sensitive writes inside the RPCs below.
revoke all on table public.stats from anon, authenticated;
revoke all on table public.quests from anon, authenticated;
revoke all on table public.journal_entries from anon, authenticated;
revoke all on table public.quest_completions from anon, authenticated;
revoke all on table public.xp_log from anon, authenticated;

grant select on table public.stats to authenticated;
grant select, insert, delete on table public.quests to authenticated;
grant select, insert, update, delete on table public.journal_entries to authenticated;
grant select on table public.quest_completions to authenticated;
grant select on table public.xp_log to authenticated;

create policy "Users can view their own stats"
  on public.stats for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can view their own quests"
  on public.quests for select to authenticated
  using ((select auth.uid()) = user_id);

-- Quest state changes are intentionally not granted directly. Use
-- complete_quest so quest, XP, stat, and history updates stay atomic.
create policy "Users can add their own incomplete quests"
  on public.quests for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and is_completed = false
    and completed_at is null
  );

create policy "Users can delete their own quests"
  on public.quests for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can view their own journal entries"
  on public.journal_entries for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own journal entries"
  on public.journal_entries for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can edit their own journal entries"
  on public.journal_entries for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own journal entries"
  on public.journal_entries for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can view their own quest history"
  on public.quest_completions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can view their own XP log"
  on public.xp_log for select to authenticated
  using ((select auth.uid()) = user_id);

-- Resets only the calling user's stale daily rows. We retain completed_at so
-- quest_completions remains the authoritative streak history.
create or replace function public.reset_daily_quests()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_today_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_reset_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.quests
  set is_completed = false
  where user_id = v_user_id
    and is_daily = true
    and is_completed = true
    and completed_at < v_today_start;

  get diagnostics v_reset_count = row_count;
  return v_reset_count;
end;
$$;

-- Completes a quest exactly once per calendar day for daily quests. The
-- stat reward is ceil(xp_value / 10), with a minimum of 1 and a stat cap of
-- 100. All affected rows are written in this one transaction.
create or replace function public.complete_quest(p_quest_id uuid)
returns table (
  quest_id uuid,
  xp_awarded integer,
  stat_name text,
  stat_gain integer,
  new_stat_value integer,
  total_xp bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_today_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_quest public.quests%rowtype;
  v_stat_gain integer;
  v_new_stat_value integer;
  v_total_xp bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- A completion also makes every stale daily quest visibly available again.
  update public.quests
  set is_completed = false
  where user_id = v_user_id
    and is_daily = true
    and is_completed = true
    and completed_at < v_today_start;

  select *
  into v_quest
  from public.quests
  where id = p_quest_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Quest not found' using errcode = 'P0002';
  end if;

  if not v_quest.is_daily and v_quest.is_completed then
    raise exception 'Quest has already been completed' using errcode = 'P0001';
  end if;

  if v_quest.is_daily
     and v_quest.completed_at is not null
     and v_quest.completed_at >= v_today_start then
    raise exception 'Daily quest has already been completed today' using errcode = 'P0001';
  end if;

  -- This also heals rows for users created before the Auth trigger existed.
  insert into public.stats (user_id, stat_name, value)
  values (v_user_id, v_quest.tag, 0)
  on conflict (user_id, stat_name) do nothing;

  v_stat_gain := greatest(1, ceil(v_quest.xp_value::numeric / 10)::integer);

  update public.stats
  set value = least(100, value + v_stat_gain)
  where user_id = v_user_id
    and stat_name = v_quest.tag
  returning value into v_new_stat_value;

  update public.quests
  set is_completed = true,
      completed_at = v_now
  where id = v_quest.id;

  insert into public.quest_completions (
    quest_id,
    user_id,
    completed_at,
    completed_on,
    xp_awarded,
    stat_gain
  )
  values (
    v_quest.id,
    v_user_id,
    v_now,
    (v_now at time zone 'UTC')::date,
    v_quest.xp_value,
    v_stat_gain
  );

  insert into public.xp_log (user_id, amount, source, quest_id)
  values (
    v_user_id,
    v_quest.xp_value,
    'Quest completed: ' || v_quest.title,
    v_quest.id
  );

  select coalesce(sum(amount), 0)::bigint
  into v_total_xp
  from public.xp_log
  where user_id = v_user_id;

  return query
  select
    v_quest.id,
    v_quest.xp_value,
    v_quest.tag::text,
    v_stat_gain,
    v_new_stat_value,
    v_total_xp;
end;
$$;

-- Returns enough XP values to render the level formula and the next-level
-- progress bar without exposing write access to xp_log.
create or replace function public.get_my_character_progress()
returns table (
  total_xp bigint,
  level integer,
  xp_into_current_level bigint,
  xp_needed_for_next_level bigint,
  next_level_total_xp bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_total_xp bigint;
  v_level integer;
  v_level_floor_xp bigint;
  v_next_level_total_xp bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select coalesce(sum(amount), 0)::bigint
  into v_total_xp
  from public.xp_log
  where user_id = v_user_id;

  v_level := floor(sqrt(v_total_xp::numeric / 100))::integer;
  v_level_floor_xp := v_level::bigint * v_level::bigint * 100;
  v_next_level_total_xp := (v_level::bigint + 1) * (v_level::bigint + 1) * 100;

  return query
  select
    v_total_xp,
    v_level,
    v_total_xp - v_level_floor_xp,
    v_next_level_total_xp - v_level_floor_xp,
    v_next_level_total_xp;
end;
$$;

-- A streak includes today, or yesterday while the current UTC day is still
-- in progress. Any older gap makes the current streak zero.
create or replace function public.get_habit_streaks()
returns table (
  quest_id uuid,
  title text,
  tag text,
  current_streak integer,
  last_completed_date date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'UTC')::date;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return query
  with daily_quests as (
    select quest.id, quest.title, quest.tag, quest.created_at
    from public.quests as quest
    where quest.user_id = v_user_id
      and quest.is_daily = true
  ),
  completion_days as (
    select qc.quest_id, qc.completed_on
    from public.quest_completions as qc
    join daily_quests as q on q.id = qc.quest_id
    where qc.user_id = v_user_id
    group by qc.quest_id, qc.completed_on
  ),
  ranked_days as (
    select
      completion_day.quest_id,
      completion_day.completed_on,
      completion_day.completed_on - row_number() over (
        partition by completion_day.quest_id
        order by completion_day.completed_on desc
      )::integer as streak_group
    from completion_days as completion_day
  ),
  last_days as (
    select completion_day.quest_id, max(completion_day.completed_on) as last_completed_date
    from completion_days as completion_day
    group by completion_day.quest_id
  ),
  current_groups as (
    select ranked.quest_id, ranked.streak_group
    from ranked_days as ranked
    join last_days as last_day
      on last_day.quest_id = ranked.quest_id
     and last_day.last_completed_date = ranked.completed_on
    where last_day.last_completed_date >= v_today - 1
  ),
  streaks as (
    select current_group.quest_id, count(*)::integer as current_streak
    from current_groups as current_group
    join ranked_days as ranked
      on ranked.quest_id = current_group.quest_id
     and ranked.streak_group = current_group.streak_group
    group by current_group.quest_id
  )
  select
    q.id,
    q.title,
    q.tag::text,
    coalesce(streak.current_streak, 0),
    last_day.last_completed_date
  from daily_quests as q
  left join last_days as last_day on last_day.quest_id = q.id
  left join streaks as streak on streak.quest_id = q.id
  order by q.created_at asc;
end;
$$;

revoke all on function public.reset_daily_quests() from public;
revoke all on function public.complete_quest(uuid) from public;
revoke all on function public.get_my_character_progress() from public;
revoke all on function public.get_habit_streaks() from public;

grant execute on function public.reset_daily_quests() to authenticated;
grant execute on function public.complete_quest(uuid) to authenticated;
grant execute on function public.get_my_character_progress() to authenticated;
grant execute on function public.get_habit_streaks() to authenticated;

commit;
