begin;

-- NULL means a pre-migration entry whose individual impact was not recorded.
alter table public.ai_check_ins add column category_gains jsonb
  check (category_gains is null or jsonb_typeof(category_gains) = 'object');

alter table public.xp_log alter column amount type numeric;
alter table public.xp_log
  add column check_in_day date,
  add column check_in_substat text,
  add constraint xp_log_check_in_identity check (
    (check_in_day is null and check_in_substat is null) or
    (check_in_day is not null and check_in_substat is not null)
  ),
  add constraint xp_log_check_in_unique unique (user_id, check_in_day, check_in_substat),
  add constraint xp_log_check_in_substat_fk foreign key (user_id, check_in_substat)
    references public.stat_subscores(user_id, substat_id);

create function public.sync_check_in_score_xp()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.applied_change > 0 then
    insert into public.xp_log(user_id, amount, source, check_in_day, check_in_substat)
      values (new.user_id, new.applied_change, 'Check-in gains: ' || new.substat_id, new.local_day, new.substat_id)
    on conflict on constraint xp_log_check_in_unique do update
      set amount = greatest(public.xp_log.amount, excluded.amount);
  end if;
  return new;
end;
$$;
revoke all on function public.sync_check_in_score_xp() from public, anon, authenticated, service_role;
create trigger check_in_scores_award_xp
  after insert or update of applied_change on public.check_in_daily_scores
  for each row execute function public.sync_check_in_score_xp();

-- Credit already-applied gains once, without resubmitting or rescoring entries.
insert into public.xp_log(user_id, amount, source, check_in_day, check_in_substat)
  select user_id, applied_change, 'Check-in gains: ' || substat_id, local_day, substat_id
  from public.check_in_daily_scores where applied_change > 0
on conflict on constraint xp_log_check_in_unique do nothing;

alter function public.save_check_in_evidence(uuid, uuid, uuid, text, text, timestamptz, jsonb, text)
  rename to save_check_in_evidence_scored;
revoke all on function public.save_check_in_evidence_scored(uuid, uuid, uuid, text, text, timestamptz, jsonb, text)
  from public, anon, authenticated, service_role;

create function public.save_check_in_evidence(
  p_user_id uuid, p_session_id uuid, p_request_id uuid, p_content text,
  p_timezone text, p_received_at timestamptz, p_analysis jsonb, p_model text
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_existing boolean;
  v_before jsonb;
  v_result jsonb;
  v_gains jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select exists(select 1 from public.ai_check_ins where user_id = p_user_id and request_id = p_request_id)
    into v_existing;
  select jsonb_object_agg(substat_id, value) into v_before
    from public.stat_subscores where user_id = p_user_id;
  v_result := public.save_check_in_evidence_scored(p_user_id, p_session_id, p_request_id,
    p_content, p_timezone, p_received_at, p_analysis, p_model);
  if not v_existing then
    select jsonb_object_agg(base_stat, gain) into v_gains from (
      select public.check_in_base_stat(s.substat_id)::text as base_stat,
        sum(s.value - (v_before ->> s.substat_id)::numeric) as gain
      from public.stat_subscores s join public.lifestats_settings settings on settings.user_id = s.user_id
      where s.user_id = p_user_id and (s.substat_id <> 'spirituality' or settings.spirituality_enabled)
      group by public.check_in_base_stat(s.substat_id)
    ) changes;
    update public.ai_check_ins set category_gains = v_gains
      where id = (v_result ->> 'entry_id')::uuid and user_id = p_user_id;
  end if;
  return v_result;
end;
$$;

revoke all on function public.save_check_in_evidence(uuid, uuid, uuid, text, text, timestamptz, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.save_check_in_evidence(uuid, uuid, uuid, text, text, timestamptz, jsonb, text)
  to service_role;

drop function public.get_my_character_progress();
create function public.get_my_character_progress()
returns table (total_xp numeric, level integer, xp_into_current_level numeric,
  xp_needed_for_next_level numeric, next_level_total_xp numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid := auth.uid();
  v_total numeric;
  v_level integer;
  v_floor numeric;
  v_next numeric;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select coalesce(sum(amount), 0) into v_total from public.xp_log where user_id = v_user_id;
  v_level := floor(sqrt(v_total / 100))::integer;
  v_floor := v_level::numeric * v_level * 100;
  v_next := (v_level::numeric + 1) * (v_level::numeric + 1) * 100;
  return query select v_total, v_level, v_total - v_floor, v_next - v_floor, v_next;
end;
$$;
revoke all on function public.get_my_character_progress() from public, anon;
grant execute on function public.get_my_character_progress() to authenticated;

drop function public.complete_quest(uuid);
create function public.complete_quest(p_quest_id uuid)
returns table (quest_id uuid, xp_awarded integer, stat_name text, stat_gain integer,
  new_stat_value integer, total_xp numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_today_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_quest public.quests%rowtype;
  v_gain integer;
  v_xp integer;
  v_value integer;
  v_total numeric;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  update public.quests set is_completed = false
    where user_id = v_user_id and is_daily and is_completed and completed_at < v_today_start;
  select * into v_quest from public.quests where id = p_quest_id and user_id = v_user_id for update;
  if not found then raise exception 'Quest not found'; end if;
  if v_quest.is_completed and (not v_quest.is_daily or v_quest.completed_at >= v_today_start) then
    raise exception 'Quest has already been completed';
  end if;
  v_gain := greatest(1, ceil(v_quest.xp_value::numeric / 10)::integer);
  v_xp := case when v_quest.is_daily then v_quest.xp_value else 0 end;
  update public.stat_subscores set value = least(100, value + v_gain)
    where user_id = v_user_id and substat_id = v_quest.substat_id;
  v_value := public.recalculate_base_stat(v_user_id, v_quest.tag);
  update public.quests set is_completed = true, completed_at = v_now where id = v_quest.id;
  insert into public.quest_completions(quest_id, user_id, completed_at, completed_on, xp_awarded, stat_gain)
    values (v_quest.id, v_user_id, v_now, (v_now at time zone 'UTC')::date, v_xp, v_gain);
  if v_xp > 0 then
    insert into public.xp_log(user_id, amount, source, quest_id)
      values (v_user_id, v_xp, 'Habit completed: ' || v_quest.title, v_quest.id);
  end if;
  select coalesce(sum(amount), 0) into v_total from public.xp_log where user_id = v_user_id;
  return query select v_quest.id, v_xp, v_quest.tag::text, v_gain, v_value, v_total;
end;
$$;
revoke all on function public.complete_quest(uuid) from public, anon;
grant execute on function public.complete_quest(uuid) to authenticated;
commit;
