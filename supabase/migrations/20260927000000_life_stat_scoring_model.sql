-- Authoritative LifeStats scoring model.
--
-- Scores are derived, never independently edited: measurements -> substats
-- -> the six fixed core stats -> Life. A daily snapshot preserves trends.

-- The old character-sheet enum is retained only for existing quest data.
-- Add the three missing labels in a committed transaction before converting
-- legacy rows to the fixed six-category vocabulary.
begin;

alter type public.stat_tag add value if not exists 'health';
alter type public.stat_tag add value if not exists 'progress';
alter type public.stat_tag add value if not exists 'prosperity';

commit;

begin;

update public.quests
set tag = case tag::text
  when 'vitality' then 'health'::public.stat_tag
  when 'strength' then 'prosperity'::public.stat_tag
  when 'discipline' then 'progress'::public.stat_tag
  when 'career' then 'prosperity'::public.stat_tag
  when 'mind' then 'intellect'::public.stat_tag
  else tag
end
where tag::text in ('vitality', 'strength', 'discipline', 'career', 'mind');

update public.stats
set stat_name = case stat_name::text
  when 'vitality' then 'health'::public.stat_tag
  when 'strength' then 'prosperity'::public.stat_tag
  when 'discipline' then 'progress'::public.stat_tag
  when 'career' then 'prosperity'::public.stat_tag
  when 'mind' then 'intellect'::public.stat_tag
  else stat_name
end
where stat_name::text in ('vitality', 'strength', 'discipline', 'career', 'mind');

create type public.core_stat_key as enum (
  'health',
  'intellect',
  'progress',
  'social',
  'prosperity',
  'purpose'
);

create type public.score_history_scope as enum ('life', 'core', 'substat');

-- This reference table is deliberately seeded with exactly six rows. The
-- enum and the absence of authenticated write grants prevent new cores from
-- being introduced by the application.
create table public.core_stat_definitions (
  key public.core_stat_key primary key,
  label text not null unique,
  sort_order smallint not null unique check (sort_order between 1 and 6)
);

insert into public.core_stat_definitions (key, label, sort_order)
values
  ('health', 'Health', 1),
  ('intellect', 'Intellect', 2),
  ('progress', 'Progress', 3),
  ('social', 'Social', 4),
  ('prosperity', 'Prosperity', 5),
  ('purpose', 'Purpose', 6);

create table public.substat_templates (
  core_stat public.core_stat_key not null references public.core_stat_definitions (key) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order smallint not null check (sort_order > 0),
  primary key (core_stat, slug),
  unique (core_stat, sort_order)
);

insert into public.substat_templates (core_stat, slug, name, sort_order)
values
  ('health', 'sleep', 'Sleep', 1),
  ('health', 'exercise', 'Exercise', 2),
  ('health', 'nutrition', 'Nutrition', 3),
  ('health', 'energy', 'Energy', 4),
  ('health', 'mood', 'Mood', 5),
  ('health', 'stress', 'Stress', 6),
  ('health', 'recovery', 'Recovery', 7),
  ('health', 'hydration', 'Hydration', 8),
  ('intellect', 'knowledge', 'Knowledge', 1),
  ('intellect', 'focus', 'Focus', 2),
  ('intellect', 'memory', 'Memory', 3),
  ('intellect', 'reading', 'Reading', 4),
  ('intellect', 'learning', 'Learning', 5),
  ('intellect', 'critical-thinking', 'Critical Thinking', 6),
  ('intellect', 'problem-solving', 'Problem Solving', 7),
  ('intellect', 'curiosity', 'Curiosity', 8),
  ('progress', 'discipline', 'Discipline', 1),
  ('progress', 'habits', 'Habits', 2),
  ('progress', 'goals', 'Goals', 3),
  ('progress', 'deep-work', 'Deep Work', 4),
  ('progress', 'tasks-completed', 'Tasks Completed', 5),
  ('progress', 'consistency', 'Consistency', 6),
  ('progress', 'time-management', 'Time Management', 7),
  ('progress', 'efficiency', 'Efficiency', 8),
  ('progress', 'self-improvement', 'Self-Improvement', 9),
  ('social', 'friends', 'Friends', 1),
  ('social', 'family', 'Family', 2),
  ('social', 'social-time', 'Social Time', 3),
  ('social', 'communication', 'Communication', 4),
  ('social', 'meaningful-conversations', 'Meaningful Conversations', 5),
  ('social', 'social-activities', 'Social Activities', 6),
  ('social', 'new-connections', 'New Connections', 7),
  ('social', 'social-satisfaction', 'Social Satisfaction', 8),
  ('prosperity', 'income', 'Income', 1),
  ('prosperity', 'spending', 'Spending', 2),
  ('prosperity', 'savings', 'Savings', 3),
  ('prosperity', 'investing', 'Investing', 4),
  ('prosperity', 'budgeting', 'Budgeting', 5),
  ('prosperity', 'career-progress', 'Career Progress', 6),
  ('prosperity', 'performance', 'Performance', 7),
  ('prosperity', 'projects', 'Projects', 8),
  ('prosperity', 'achievements', 'Achievements', 9),
  ('prosperity', 'opportunities', 'Opportunities', 10),
  ('purpose', 'life-goals', 'Life Goals', 1),
  ('purpose', 'direction', 'Direction', 2),
  ('purpose', 'values', 'Values', 3),
  ('purpose', 'fulfillment', 'Fulfillment', 4),
  ('purpose', 'meaningful-activity', 'Meaningful Activity', 5),
  ('purpose', 'ambition', 'Ambition', 6),
  ('purpose', 'contribution', 'Contribution', 7),
  ('purpose', 'goal-alignment', 'Goal Alignment', 8),
  ('purpose', 'life-satisfaction', 'Life Satisfaction', 9);

create table public.user_substats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  core_stat public.core_stat_key not null references public.core_stat_definitions (key) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, core_stat, slug)
);

create table public.substat_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  substat_id uuid not null references public.user_substats (id) on delete cascade,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.score_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recorded_on date not null,
  score_type public.score_history_scope not null,
  core_stat public.core_stat_key references public.core_stat_definitions (key) on delete restrict,
  substat_id uuid references public.user_substats (id) on delete restrict,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  captured_at timestamptz not null default now(),
  check (
    (score_type = 'life' and core_stat is null and substat_id is null)
    or (score_type = 'core' and core_stat is not null and substat_id is null)
    or (score_type = 'substat' and core_stat is not null and substat_id is not null)
  )
);

create unique index score_history_daily_score_idx
  on public.score_history (
    user_id,
    recorded_on,
    score_type,
    coalesce(core_stat::text, ''),
    coalesce(substat_id::text, '')
  );

create index user_substats_user_core_idx on public.user_substats (user_id, core_stat, created_at);
create index substat_measurements_user_substat_measured_idx
  on public.substat_measurements (user_id, substat_id, measured_at desc);
create index score_history_user_date_idx on public.score_history (user_id, recorded_on desc);

create trigger set_user_substats_updated_at
before update on public.user_substats
for each row execute procedure public.set_updated_at();

-- A substat's score is the mean of its recorded 0–100 measurements. A core
-- is the mean of all active substats in that core. Life is the mean of all
-- six core scores, including zeros for unmeasured default substats.
create or replace function public.current_life_score_rows(
  p_user_id uuid,
  p_as_of timestamptz default now()
)
returns table (
  score_type public.score_history_scope,
  core_stat public.core_stat_key,
  substat_id uuid,
  substat_name text,
  score numeric,
  measurement_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with substat_scores as (
    select
      substat.core_stat,
      substat.id as substat_id,
      substat.name as substat_name,
      coalesce(avg(measurement.score), 0::numeric) as score,
      count(measurement.id)::bigint as measurement_count
    from public.user_substats as substat
    left join public.substat_measurements as measurement
      on measurement.substat_id = substat.id
      and measurement.user_id = substat.user_id
      and measurement.measured_at <= p_as_of
    where substat.user_id = p_user_id
      and substat.is_active
    group by substat.core_stat, substat.id, substat.name
  ),
  core_scores as (
    select
      definition.key as core_stat,
      coalesce(avg(substat.score), 0::numeric) as score
    from public.core_stat_definitions as definition
    left join substat_scores as substat on substat.core_stat = definition.key
    group by definition.key
  )
  select 'substat'::public.score_history_scope, core_stat, substat_id, substat_name, score, measurement_count
  from substat_scores
  union all
  select 'core'::public.score_history_scope, core_stat, null::uuid, null::text, score, 0::bigint
  from core_scores
  union all
  select 'life'::public.score_history_scope, null::public.core_stat_key, null::uuid, null::text,
    coalesce(avg(score), 0::numeric), 0::bigint
  from core_scores;
$$;

create or replace function public.snapshot_life_scores(
  p_user_id uuid,
  p_recorded_on date,
  p_as_of timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.score_history (
    user_id, recorded_on, score_type, core_stat, substat_id, score, captured_at
  )
  select
    p_user_id,
    p_recorded_on,
    current_score.score_type,
    current_score.core_stat,
    current_score.substat_id,
    round(current_score.score, 2),
    now()
  from public.current_life_score_rows(p_user_id, p_as_of) as current_score
  on conflict (
    user_id,
    recorded_on,
    score_type,
    (coalesce(core_stat::text, '')),
    (coalesce(substat_id::text, ''))
  ) do update
    set score = excluded.score,
        captured_at = excluded.captured_at;
end;
$$;

create or replace function public.seed_life_stat_substats(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.user_substats (user_id, core_stat, slug, name)
  select p_user_id, template.core_stat, template.slug, template.name
  from public.substat_templates as template
  on conflict (user_id, core_stat, slug) do nothing;
end;
$$;

-- Existing users receive the default 52 substats. Newly added substats are
-- independent rows, so they can extend a core without changing this schema.
select public.seed_life_stat_substats(id) from auth.users;

-- Keep the old trigger name so projects already using it continue to work,
-- but seed the new model too. The old stats table is no longer read by the
-- Life score UI or calculation functions.
create or replace function public.seed_stats_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.stats (user_id, stat_name, value)
  values
    (new.id, 'health'::public.stat_tag, 0),
    (new.id, 'intellect'::public.stat_tag, 0),
    (new.id, 'progress'::public.stat_tag, 0),
    (new.id, 'social'::public.stat_tag, 0),
    (new.id, 'prosperity'::public.stat_tag, 0),
    (new.id, 'purpose'::public.stat_tag, 0)
  on conflict (user_id, stat_name) do nothing;

  perform public.seed_life_stat_substats(new.id);
  perform public.snapshot_life_scores(new.id, (now() at time zone 'UTC')::date, now());
  return new;
end;
$$;

create or replace function public.snapshot_life_scores_after_measurement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_measurement_day date;
  v_today date := (now() at time zone 'UTC')::date;
begin
  v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  v_measurement_day := case
    when tg_op = 'DELETE' then (old.measured_at at time zone 'UTC')::date
    else (new.measured_at at time zone 'UTC')::date
  end;

  -- A backdated measurement receives an accurate end-of-day reconstruction;
  -- today's snapshot then reflects the current, dynamic score as well.
  perform public.snapshot_life_scores(
    v_user_id,
    v_measurement_day,
    ((v_measurement_day + 1)::timestamp at time zone 'UTC') - interval '1 microsecond'
  );
  if v_measurement_day <> v_today then
    perform public.snapshot_life_scores(v_user_id, v_today, now());
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.snapshot_life_scores_after_substat_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Bulk default seeding occurs under another trigger; seed_stats_for_new_user
  -- captures one final complete snapshot after all 52 rows have been created.
  if pg_trigger_depth() = 1 then
    perform public.snapshot_life_scores(new.user_id, (now() at time zone 'UTC')::date, now());
  end if;
  return new;
end;
$$;

create trigger snapshot_life_scores_on_measurement
after insert or update or delete on public.substat_measurements
for each row execute procedure public.snapshot_life_scores_after_measurement();

create trigger snapshot_life_scores_on_substat_change
after insert on public.user_substats
for each row execute procedure public.snapshot_life_scores_after_substat_change();

create or replace function public.create_my_substat(
  p_core_stat public.core_stat_key,
  p_name text
)
returns table (id uuid, core_stat public.core_stat_key, name text, slug text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(p_name);
  v_slug text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Substat names must be between 1 and 80 characters' using errcode = '22023';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then
    raise exception 'Substat name must contain a letter or number' using errcode = '22023';
  end if;

  insert into public.user_substats (user_id, core_stat, name, slug)
  values (v_user_id, p_core_stat, v_name, v_slug)
  returning user_substats.id, user_substats.core_stat, user_substats.name, user_substats.slug
  into id, core_stat, name, slug;

  return next;
exception
  when unique_violation then
    raise exception 'That substat already exists in this core category' using errcode = '23505';
end;
$$;

create or replace function public.record_my_substat_measurement(
  p_substat_id uuid,
  p_score numeric,
  p_measured_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_measurement_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_score < 0 or p_score > 100 then
    raise exception 'Measurement scores must be between 0 and 100' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.user_substats
    where id = p_substat_id and user_id = v_user_id and is_active
  ) then
    raise exception 'Substat not found' using errcode = 'P0002';
  end if;

  insert into public.substat_measurements (user_id, substat_id, score, measured_at)
  values (v_user_id, p_substat_id, round(p_score, 2), p_measured_at)
  returning id into v_measurement_id;

  return v_measurement_id;
end;
$$;

create or replace function public.capture_my_life_score_snapshot()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  perform public.snapshot_life_scores(v_user_id, (now() at time zone 'UTC')::date, now());
end;
$$;

create or replace function public.get_my_life_scores()
returns table (
  score_type public.score_history_scope,
  core_stat public.core_stat_key,
  substat_id uuid,
  substat_name text,
  score numeric,
  measurement_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  return query select * from public.current_life_score_rows(v_user_id, now());
end;
$$;

-- `daily`, `weekly`, `monthly`, and `yearly` aggregate daily snapshots into
-- trend-ready rows. The caller can select life, core, or substat series.
create or replace function public.get_my_score_trends(
  p_granularity text,
  p_from date default null
)
returns table (
  period_start date,
  score_type text,
  core_stat text,
  substat_id uuid,
  average_score numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_granularity not in ('daily', 'weekly', 'monthly', 'yearly') then
    raise exception 'Granularity must be daily, weekly, monthly, or yearly' using errcode = '22023';
  end if;

  return query
  select
    case p_granularity
      when 'daily' then history.recorded_on
      when 'weekly' then date_trunc('week', history.recorded_on)::date
      when 'monthly' then date_trunc('month', history.recorded_on)::date
      when 'yearly' then date_trunc('year', history.recorded_on)::date
    end as period_start,
    history.score_type::text,
    history.core_stat::text,
    history.substat_id,
    round(avg(history.score), 2) as average_score
  from public.score_history as history
  where history.user_id = v_user_id
    and (p_from is null or history.recorded_on >= p_from)
  group by 1, history.score_type, history.core_stat, history.substat_id
  order by 1, history.score_type, history.core_stat;
end;
$$;

alter table public.core_stat_definitions enable row level security;
alter table public.substat_templates enable row level security;
alter table public.user_substats enable row level security;
alter table public.substat_measurements enable row level security;
alter table public.score_history enable row level security;

revoke all on table public.core_stat_definitions from anon, authenticated;
revoke all on table public.substat_templates from anon, authenticated;
revoke all on table public.user_substats from anon, authenticated;
revoke all on table public.substat_measurements from anon, authenticated;
revoke all on table public.score_history from anon, authenticated;

grant select on table public.core_stat_definitions, public.substat_templates to authenticated;
grant select on table public.user_substats, public.substat_measurements, public.score_history to authenticated;

create policy "Authenticated users can view the fixed core definitions"
  on public.core_stat_definitions for select to authenticated using (true);
create policy "Authenticated users can view the default substat templates"
  on public.substat_templates for select to authenticated using (true);
create policy "Users can view their own substats"
  on public.user_substats for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can view their own substat measurements"
  on public.substat_measurements for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can view their own score history"
  on public.score_history for select to authenticated using ((select auth.uid()) = user_id);

revoke all on function public.current_life_score_rows(uuid, timestamptz) from public;
revoke all on function public.snapshot_life_scores(uuid, date, timestamptz) from public;
revoke all on function public.seed_life_stat_substats(uuid) from public;
revoke all on function public.create_my_substat(public.core_stat_key, text) from public;
revoke all on function public.record_my_substat_measurement(uuid, numeric, timestamptz) from public;
revoke all on function public.capture_my_life_score_snapshot() from public;
revoke all on function public.get_my_life_scores() from public;
revoke all on function public.get_my_score_trends(text, date) from public;

grant execute on function public.create_my_substat(public.core_stat_key, text) to authenticated;
grant execute on function public.record_my_substat_measurement(uuid, numeric, timestamptz) to authenticated;
grant execute on function public.capture_my_life_score_snapshot() to authenticated;
grant execute on function public.get_my_life_scores() to authenticated;
grant execute on function public.get_my_score_trends(text, date) to authenticated;

-- Give existing users a first, complete daily baseline after all functions and
-- triggers are in place.
select public.snapshot_life_scores(id, (now() at time zone 'UTC')::date, now()) from auth.users;

commit;
