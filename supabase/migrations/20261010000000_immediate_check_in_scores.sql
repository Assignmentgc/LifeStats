begin;

create function public.apply_check_in_day_gains(p_user_id uuid, p_day date)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_score record;
  v_ledger public.check_in_daily_scores%rowtype;
  v_before numeric(5,2);
  v_after numeric(5,2);
  v_consumed numeric(3,2);
  v_target numeric(3,2);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  for v_score in select * from public.check_in_day_evidence(p_user_id, p_day) order by substat_id loop
    select * into v_ledger from public.check_in_daily_scores
      where user_id = p_user_id and local_day = p_day and substat_id = v_score.substat_id for update;
    v_consumed := coalesce(v_ledger.requested_change, 0);
    -- Already awarded gains are never revoked by later contradictory evidence.
    v_target := greatest(v_consumed, least(5, v_score.change));
    select value into strict v_before from public.stat_subscores
      where user_id = p_user_id and substat_id = v_score.substat_id for update;
    v_after := least(100, v_before + v_target - v_consumed);
    if v_after <> v_before then
      update public.stat_subscores set value = v_after, updated_at = now()
        where user_id = p_user_id and substat_id = v_score.substat_id;
      perform public.recalculate_base_stat(p_user_id, public.check_in_base_stat(v_score.substat_id));
    end if;
    insert into public.check_in_daily_scores(user_id, local_day, substat_id, requested_change,
      applied_change, previous_value, value, evidence_ids, rules_version)
    values (p_user_id, p_day, v_score.substat_id, v_target,
      coalesce(v_ledger.applied_change, 0) + v_after - v_before,
      coalesce(v_ledger.previous_value, v_before), v_after,
      v_score.evidence_ids, '3')
    on conflict (user_id, local_day, substat_id) do update set
      requested_change = excluded.requested_change,
      applied_change = excluded.applied_change,
      value = excluded.value,
      evidence_ids = array(
        select distinct id from unnest(public.check_in_daily_scores.evidence_ids || excluded.evidence_ids) id
      ),
      rules_version = excluded.rules_version,
      aggregated_at = now();
  end loop;
end;
$$;

create or replace function public.get_check_in_result(p_user_id uuid, p_entry_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_entry public.ai_check_ins%rowtype; v_scores jsonb;
begin
  select * into strict v_entry from public.ai_check_ins
    where id = p_entry_id and user_id = p_user_id and session_id is not null;
  select coalesce(jsonb_agg(jsonb_build_object(
    'substat_id', score.substat_id, 'applied_change', score.applied_change,
    'daily_allowance_used', score.requested_change
  ) order by score.substat_id), '[]'::jsonb) into v_scores
  from public.check_in_daily_scores score
  where score.user_id = p_user_id and score.local_day = v_entry.local_day
    and exists (select 1 from public.check_in_evidence e where
      e.user_id = p_user_id and e.session_id = v_entry.session_id
      and e.local_day = v_entry.local_day and e.substat_id = score.substat_id);
  return jsonb_build_object(
    'entry_id', v_entry.id, 'local_day', v_entry.local_day,
    'timezone', (select timezone from public.check_in_sessions where id = v_entry.session_id),
    'analysis', v_entry.analysis, 'session_indicators', '[]'::jsonb,
    'daily_scores', v_scores, 'scoring_mode', 'immediate'
  );
end;
$$;

alter function public.save_check_in_evidence(uuid, uuid, uuid, text, text, timestamptz, jsonb, text)
  rename to save_check_in_evidence_internal;
revoke all on function public.save_check_in_evidence_internal(uuid, uuid, uuid, text, text, timestamptz, jsonb, text)
  from public, anon, authenticated, service_role;

create function public.save_check_in_evidence(
  p_user_id uuid, p_session_id uuid, p_request_id uuid, p_content text,
  p_timezone text, p_received_at timestamptz, p_analysis jsonb, p_model text
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb; v_entry public.ai_check_ins%rowtype;
begin
  v_result := public.save_check_in_evidence_internal(p_user_id, p_session_id, p_request_id,
    p_content, p_timezone, p_received_at, p_analysis, p_model);
  select * into strict v_entry from public.ai_check_ins
    where id = (v_result ->> 'entry_id')::uuid and user_id = p_user_id;
  if v_entry.aggregated_at is null then
    perform public.apply_check_in_day_gains(p_user_id, v_entry.local_day);
  end if;
  return public.get_check_in_result(p_user_id, v_entry.id);
end;
$$;

create or replace function public.aggregate_due_check_ins()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_day record; v_count integer := 0;
begin
  for v_day in
    select distinct ci.user_id, ci.local_day
    from public.ai_check_ins ci join public.lifestats_settings s on s.user_id = ci.user_id
    where ci.session_id is not null and ci.aggregated_at is null
      and public.check_in_day_is_closed(ci.local_day, s.check_in_timezone, now())
    order by ci.user_id, ci.local_day
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_day.user_id::text, 0));
    if not exists (select 1 from public.ai_check_ins where user_id = v_day.user_id
      and local_day = v_day.local_day and session_id is not null and aggregated_at is null) then continue; end if;
    perform public.apply_check_in_day_gains(v_day.user_id, v_day.local_day);
    update public.ai_check_ins set aggregated_at = now()
      where user_id = v_day.user_id and local_day = v_day.local_day and session_id is not null and aggregated_at is null;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Catch up previously saved evidence without requiring another provider request.
do $$
declare v_day record;
begin
  for v_day in select distinct user_id, local_day from public.ai_check_ins
    where session_id is not null and aggregated_at is null order by user_id, local_day
  loop
    perform public.apply_check_in_day_gains(v_day.user_id, v_day.local_day);
  end loop;
end;
$$;

revoke all on function public.apply_check_in_day_gains(uuid, date),
  public.save_check_in_evidence(uuid, uuid, uuid, text, text, timestamptz, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.save_check_in_evidence(uuid, uuid, uuid, text, text, timestamptz, jsonb, text)
  to service_role;
commit;
