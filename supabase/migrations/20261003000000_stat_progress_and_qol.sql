begin;

-- Preserve every persisted stat change so the monthly chart is based on the
-- user's own progress, including AI check-ins and completed quests.
create table public.stat_progress_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stat_name public.stat_tag not null,
  previous_value integer not null check (previous_value between 0 and 100),
  value integer not null check (value between 0 and 100),
  created_at timestamptz not null default now()
);

create index stat_progress_events_user_created_idx
  on public.stat_progress_events (user_id, created_at asc);

alter table public.stat_progress_events enable row level security;
revoke all on table public.stat_progress_events from anon, authenticated;
grant select on table public.stat_progress_events to authenticated;

create policy "Users can view their own stat progress"
  on public.stat_progress_events for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.record_stat_progress()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.value is distinct from new.value then
    insert into public.stat_progress_events (user_id, stat_name, previous_value, value)
    values (new.user_id, new.stat_name, old.value, new.value);
  end if;
  return new;
end;
$$;

create trigger record_stat_progress_after_update
after update of value on public.stats
for each row execute procedure public.record_stat_progress();

create table public.qol_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  score integer not null check (score between 0 and 100),
  created_at timestamptz not null default now()
);

create index qol_scores_user_created_idx on public.qol_scores (user_id, created_at asc);

alter table public.qol_scores enable row level security;
revoke all on table public.qol_scores from anon, authenticated;
grant select on table public.qol_scores to authenticated;

create policy "Users can view their own QoL scores"
  on public.qol_scores for select to authenticated
  using ((select auth.uid()) = user_id);

drop function public.apply_ai_check_in(text, text, jsonb);

create function public.apply_ai_check_in(
  p_content text,
  p_summary text,
  p_adjustments jsonb,
  p_qol_score integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_adjustment jsonb;
  v_stat_text text;
  v_stat_name public.stat_tag;
  v_change integer;
  v_seen_stats text[] := '{}';
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if char_length(btrim(p_content)) not between 3 and 5000 then
    raise exception 'Check-in content must be between 3 and 5,000 characters';
  end if;
  if char_length(btrim(p_summary)) not between 1 and 500 then
    raise exception 'Check-in summary must be between 1 and 500 characters';
  end if;
  if p_qol_score not between 0 and 100 then
    raise exception 'QoL score must be between 0 and 100';
  end if;
  if jsonb_typeof(p_adjustments) is distinct from 'array'
     or jsonb_array_length(p_adjustments) > 6 then
    raise exception 'Check-in adjustments must be an array';
  end if;

  for v_adjustment in select value from jsonb_array_elements(p_adjustments)
  loop
    v_stat_text := v_adjustment ->> 'stat_name';
    if jsonb_typeof(v_adjustment) <> 'object'
       or v_stat_text not in ('vitality', 'strength', 'intellect', 'discipline', 'social', 'purpose')
       or jsonb_typeof(v_adjustment -> 'change') <> 'number'
       or (v_adjustment ->> 'change') !~ '^-?[0-9]+$'
       or v_stat_text = any(v_seen_stats) then
      raise exception 'Invalid stat adjustment';
    end if;

    v_change := (v_adjustment ->> 'change')::integer;
    if v_change not between -5 and 5 then
      raise exception 'Invalid stat adjustment';
    end if;
    v_seen_stats := array_append(v_seen_stats, v_stat_text);
    v_stat_name := v_stat_text::public.stat_tag;

    insert into public.stats (user_id, stat_name, value)
    values (v_user_id, v_stat_name, 0)
    on conflict (user_id, stat_name) do nothing;

    update public.stats
    set value = greatest(0, least(100, value + v_change))
    where user_id = v_user_id and stat_name = v_stat_name;
  end loop;

  insert into public.ai_check_ins (user_id, content, summary, adjustments)
  values (v_user_id, btrim(p_content), btrim(p_summary), p_adjustments);

  insert into public.qol_scores (user_id, score)
  values (v_user_id, p_qol_score);
end;
$$;

revoke all on function public.apply_ai_check_in(text, text, jsonb, integer) from public;
grant execute on function public.apply_ai_check_in(text, text, jsonb, integer) to authenticated;

commit;
