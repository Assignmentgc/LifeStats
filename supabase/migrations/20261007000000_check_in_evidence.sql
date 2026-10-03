begin;

-- Substat gains retain decimals; existing base-stat/LifeScore formulas stay rounded.
alter table public.stat_subscores alter column value type numeric(5,2);

alter table public.lifestats_settings add column check_in_timezone text;
revoke insert, update on public.lifestats_settings from authenticated;
grant insert (user_id, spirituality_enabled, include_spirituality_in_life_score),
  update (user_id, spirituality_enabled, include_spirituality_in_life_score)
  on public.lifestats_settings to authenticated;

create table public.check_in_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  timezone text not null,
  locale text not null default 'en-US' check (locale = 'en-US'),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

alter table public.ai_check_ins
  add column session_id uuid references public.check_in_sessions(id),
  add column request_id uuid,
  add column analysis jsonb,
  add column consent_version text check (consent_version is null or consent_version = 'perplexity-text-v1'),
  add column model text,
  add column local_day date,
  add column aggregated_at timestamptz,
  add constraint ai_check_ins_request_unique unique (user_id, request_id),
  add constraint ai_check_ins_session_owner foreign key (session_id, user_id)
    references public.check_in_sessions(id, user_id);

create table public.check_in_evidence (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.ai_check_ins(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  local_day date not null,
  substat_id text not null,
  source_quote text not null check (char_length(source_quote) between 1 and 500),
  observation text not null check (char_length(observation) between 1 and 240),
  activity_key text not null check (activity_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$' and char_length(activity_key) <= 80),
  direction text not null check (direction in ('positive', 'negative')),
  proposed_gain numeric(3,2),
  constraint evidence_gain_valid check (
    (direction = 'positive' and proposed_gain is not null and proposed_gain between 1 and 5) or
    (direction = 'negative' and proposed_gain is null)
  ),
  time_reference text not null check (time_reference in ('today', 'historical', 'planned', 'unclear')),
  confidence numeric not null check (confidence between 0 and 1),
  linked_quest_id uuid references public.quests(id) on delete set null,
  exclusion_reason text check (exclusion_reason in ('language', 'safety', 'low_confidence', 'historical', 'planned', 'unclear', 'quest', 'non_positive')),
  foreign key (session_id, user_id) references public.check_in_sessions(id, user_id),
  foreign key (user_id, substat_id) references public.stat_subscores(user_id, substat_id),
  created_at timestamptz not null default now()
);

create index check_in_evidence_user_day_idx on public.check_in_evidence(user_id, local_day);
create index ai_check_ins_pending_idx on public.ai_check_ins(local_day)
  where session_id is not null and aggregated_at is null;
create index ai_check_ins_session_idx on public.ai_check_ins(session_id, created_at desc);

create table public.check_in_daily_scores (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_day date not null,
  substat_id text not null,
  requested_change numeric(3,2) not null check (requested_change between 0 and 5),
  applied_change numeric(3,2) not null check (applied_change between 0 and 5),
  previous_value numeric(5,2) not null check (previous_value between 0 and 100),
  value numeric(5,2) not null check (value between 0 and 100),
  evidence_ids uuid[] not null,
  rules_version text not null default '2',
  aggregated_at timestamptz not null default now(),
  primary key (user_id, local_day, substat_id),
  foreign key (user_id, substat_id) references public.stat_subscores(user_id, substat_id)
);

alter table public.check_in_sessions enable row level security;
alter table public.check_in_evidence enable row level security;
alter table public.check_in_daily_scores enable row level security;
revoke all on public.check_in_sessions, public.check_in_evidence, public.check_in_daily_scores from anon, authenticated;
grant select on public.check_in_sessions, public.check_in_evidence, public.check_in_daily_scores to authenticated;
grant all on public.check_in_sessions, public.check_in_evidence, public.check_in_daily_scores to service_role;
create policy "Users can read their check-in sessions" on public.check_in_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can read their check-in evidence" on public.check_in_evidence for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can read their daily check-in scores" on public.check_in_daily_scores for select to authenticated using ((select auth.uid()) = user_id);

-- New analysis can only be written by the authenticated backend, not browser RPC calls.
revoke execute on function public.apply_ai_check_in(text, text, jsonb, integer) from authenticated;

create function public.check_in_base_stat(p_substat text)
returns public.stat_tag language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_substat in ('direction','goals','values','meaning','contribution') then 'purpose'::public.stat_tag
    when p_substat in ('fitness','nutrition','sleep','energy','mental_wellbeing','intellectual_growth','emotional_regulation') then 'vitality'::public.stat_tag
    when p_substat in ('family','friends','communication','community','social_life','social_confidence') then 'social'::public.stat_tag
    when p_substat in ('income','saving','spending','investing','financial_security','career','professional_growth') then 'finances'::public.stat_tag
    when p_substat in ('consistency','self_control','focus','habits','execution','initiative','time_management') then 'discipline'::public.stat_tag
    when p_substat in ('living_space','digital_environment','experiences','recreation','hobbies','nature','spirituality') then 'environment'::public.stat_tag
    else null
  end;
$$;

-- Shared by provisional session indicators and persistent daily aggregation.
-- Conflicting reports of one activity are neutral, not two separate awards.
create function public.check_in_day_evidence(p_user_id uuid, p_day date)
returns table (substat_id text, change numeric, evidence_ids uuid[])
language sql stable security definer set search_path = public, pg_temp as $$
  with activities as (
    select e.substat_id, e.activity_key,
      case when count(distinct e.direction) > 1 or min(e.direction) = 'negative' then 0
        else min(e.proposed_gain) end as change,
      array_agg(e.id order by e.created_at, e.id) as ids
    from public.check_in_evidence e
    join public.lifestats_settings s on s.user_id = e.user_id
    where e.user_id = p_user_id and e.local_day = p_day
      and (e.exclusion_reason is null or e.exclusion_reason = 'non_positive')
      and (e.substat_id <> 'spirituality' or s.spirituality_enabled)
      and not exists (
        select 1 from public.quest_completions qc
        join public.quests q on q.id = qc.quest_id
        where qc.user_id = e.user_id
          and (qc.completed_at at time zone s.check_in_timezone)::date = e.local_day
          and (q.id = e.linked_quest_id or
            (q.substat_id = e.substat_id and
             trim(both '_' from regexp_replace(lower(q.title), '[^a-z0-9]+', '_', 'g')) = e.activity_key))
      )
    group by e.substat_id, e.activity_key
  ), totals as (
    select a.substat_id, least(5, sum(a.change)) as change
    from activities a group by a.substat_id
  )
  select t.substat_id, t.change, array_agg(distinct evidence_id)
  from totals t join activities a on a.substat_id = t.substat_id
    cross join lateral unnest(a.ids) evidence_id
  group by t.substat_id, t.change;
$$;

create function public.get_check_in_result(p_user_id uuid, p_entry_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_entry public.ai_check_ins%rowtype; v_indicators jsonb;
begin
  select * into strict v_entry from public.ai_check_ins where id = p_entry_id and user_id = p_user_id and session_id is not null;
  select coalesce(jsonb_agg(jsonb_build_object(
    'substat_id', pending.substat_id, 'pending_change', pending.change, 'evidence_count', cardinality(pending.evidence_ids)
  ) order by pending.substat_id), '[]'::jsonb) into v_indicators
  from public.check_in_day_evidence(p_user_id, v_entry.local_day) pending
  where exists (
    select 1 from public.check_in_evidence e join public.ai_check_ins ci on ci.id = e.entry_id
    where e.id = any(pending.evidence_ids) and e.session_id = v_entry.session_id and ci.aggregated_at is null
  );
  return jsonb_build_object(
    'entry_id', v_entry.id, 'local_day', v_entry.local_day,
    'timezone', (select timezone from public.check_in_sessions where id = v_entry.session_id),
    'analysis', v_entry.analysis, 'session_indicators', v_indicators
  );
end;
$$;

create function public.save_check_in_evidence(
  p_user_id uuid, p_session_id uuid, p_request_id uuid, p_content text,
  p_timezone text, p_received_at timestamptz, p_analysis jsonb, p_model text
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_entry public.ai_check_ins%rowtype;
  v_session public.check_in_sessions%rowtype;
  v_day date;
  v_item jsonb;
  v_reason text;
  v_timezone text;
  v_spirituality boolean;
begin
  if p_user_id is null or p_session_id is null or p_request_id is null
    or p_content is null or char_length(btrim(p_content)) not between 3 and 5000
    or p_model is null or char_length(p_model) not between 1 and 160
    or p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Invalid check-in request';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into v_entry from public.ai_check_ins where user_id = p_user_id and request_id = p_request_id;
  if found then
    if v_entry.content <> btrim(p_content) or v_entry.session_id <> p_session_id
      or (select timezone from public.check_in_sessions where id = p_session_id) <> p_timezone then
      raise exception 'Request id already used for different content' using errcode = '23505';
    end if;
    return public.get_check_in_result(p_user_id, v_entry.id);
  end if;
  if p_received_at is null or p_received_at > now() or p_received_at < now() - interval '5 minutes' then
    raise exception 'Check-in request expired';
  end if;
  if p_analysis is null or jsonb_typeof(p_analysis) <> 'object'
    or p_analysis ->> 'schema_version' is distinct from '2'
    or p_analysis ->> 'language_status' not in ('english', 'needs_clarification')
    or jsonb_typeof(p_analysis -> 'evidence') is distinct from 'array'
    or jsonb_array_length(p_analysis -> 'evidence') > 12
    or jsonb_typeof(p_analysis -> 'safety_flags') is distinct from 'array'
    or (p_analysis ->> 'confidence')::numeric not between 0 and 1
    or char_length(btrim(p_analysis ->> 'acknowledgement')) not between 1 and 500 then
    raise exception 'Invalid check-in analysis';
  end if;
  insert into public.lifestats_settings(user_id, check_in_timezone) values (p_user_id, p_timezone)
    on conflict (user_id) do update set check_in_timezone = coalesce(public.lifestats_settings.check_in_timezone, excluded.check_in_timezone);
  select check_in_timezone, spirituality_enabled into v_timezone, v_spirituality
    from public.lifestats_settings where user_id = p_user_id;
  if v_timezone <> p_timezone then raise exception 'Check-in timezone differs from your saved timezone' using errcode = '22023'; end if;
  insert into public.check_in_sessions(id, user_id, timezone) values (p_session_id, p_user_id, p_timezone) on conflict (id) do nothing;
  select * into strict v_session from public.check_in_sessions where id = p_session_id;
  if v_session.user_id <> p_user_id or v_session.timezone <> p_timezone then
    raise exception 'Session belongs to another user or timezone' using errcode = '23505';
  end if;
  v_day := (p_received_at at time zone p_timezone)::date;
  insert into public.ai_check_ins(user_id, session_id, request_id, content, summary, adjustments, analysis, consent_version, model, local_day)
    values (p_user_id, p_session_id, p_request_id, btrim(p_content), p_analysis ->> 'acknowledgement', '[]', p_analysis, 'perplexity-text-v1', p_model, v_day)
    returning * into v_entry;
  for v_item in select value from jsonb_array_elements(p_analysis -> 'evidence') loop
    if public.check_in_base_stat(v_item ->> 'substat_id') is null
      or (v_item ->> 'substat_id' = 'spirituality' and not v_spirituality)
      or position(v_item ->> 'source_quote' in p_content) = 0 then raise exception 'Invalid evidence'; end if;
    if v_item ->> 'direction' = 'positive' and (
      jsonb_typeof(v_item -> 'proposed_gain') is distinct from 'number'
      or (v_item ->> 'proposed_gain')::numeric not between 1 and 5
    ) then raise exception 'Invalid proposed gain'; end if;
    if v_item ->> 'direction' = 'negative' and
      jsonb_typeof(v_item -> 'proposed_gain') is distinct from 'null' then raise exception 'Invalid proposed gain'; end if;
    if v_item ->> 'linked_quest_id' is not null and not exists (
      select 1 from public.quest_completions qc where qc.quest_id = (v_item ->> 'linked_quest_id')::uuid
        and qc.user_id = p_user_id and (qc.completed_at at time zone p_timezone)::date = v_day
    ) then raise exception 'Invalid linked quest'; end if;
    v_reason := case
      when p_analysis ->> 'language_status' <> 'english' then 'language'
      when jsonb_array_length(p_analysis -> 'safety_flags') > 0 then 'safety'
      when (p_analysis ->> 'confidence')::numeric < 0.8 or (v_item ->> 'confidence')::numeric < 0.8 then 'low_confidence'
      when v_item ->> 'time_reference' <> 'today' then v_item ->> 'time_reference'
      when v_item ->> 'linked_quest_id' is not null then 'quest'
      when v_item ->> 'direction' = 'negative' then 'non_positive'
      else null end;
    insert into public.check_in_evidence(entry_id, user_id, session_id, local_day, substat_id, source_quote,
      observation, activity_key, direction, proposed_gain, time_reference, confidence, linked_quest_id, exclusion_reason)
    values (v_entry.id, p_user_id, p_session_id, v_day, v_item ->> 'substat_id', v_item ->> 'source_quote',
      v_item ->> 'observation', v_item ->> 'activity_key', v_item ->> 'direction', (v_item ->> 'proposed_gain')::numeric, v_item ->> 'time_reference',
      (v_item ->> 'confidence')::numeric, (v_item ->> 'linked_quest_id')::uuid, v_reason);
  end loop;
  return public.get_check_in_result(p_user_id, v_entry.id);
end;
$$;

-- Five minutes allows requests started before midnight to finish atomically.
create function public.check_in_day_is_closed(p_day date, p_timezone text, p_at timestamptz)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select p_day < ((p_at - interval '5 minutes') at time zone p_timezone)::date;
$$;

create function public.aggregate_due_check_ins()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_day record; v_score record; v_before numeric(5,2); v_after numeric(5,2); v_count integer := 0;
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
      and local_day = v_day.local_day and aggregated_at is null) then continue; end if;
    for v_score in select * from public.check_in_day_evidence(v_day.user_id, v_day.local_day) loop
      if exists (select 1 from public.check_in_daily_scores where user_id = v_day.user_id
        and local_day = v_day.local_day and substat_id = v_score.substat_id) then
        raise exception 'Closed check-in day cannot be scored again';
      end if;
      select value into strict v_before from public.stat_subscores
        where user_id = v_day.user_id and substat_id = v_score.substat_id for update;
      v_after := greatest(0, least(100, v_before + v_score.change));
      update public.stat_subscores set value = v_after, updated_at = now()
        where user_id = v_day.user_id and substat_id = v_score.substat_id;
      insert into public.check_in_daily_scores(user_id, local_day, substat_id, requested_change, applied_change, previous_value, value, evidence_ids)
        values (v_day.user_id, v_day.local_day, v_score.substat_id, v_score.change, v_after - v_before, v_before, v_after, v_score.evidence_ids);
      perform public.recalculate_base_stat(v_day.user_id, public.check_in_base_stat(v_score.substat_id));
    end loop;
    update public.ai_check_ins set aggregated_at = now()
      where user_id = v_day.user_id and local_day = v_day.local_day and session_id is not null and aggregated_at is null;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.check_in_base_stat(text), public.check_in_day_evidence(uuid, date),
  public.check_in_day_is_closed(date, text, timestamptz),
  public.get_check_in_result(uuid, uuid), public.save_check_in_evidence(uuid, uuid, uuid, text, text, timestamptz, jsonb, text),
  public.aggregate_due_check_ins() from public, anon, authenticated;
grant execute on function public.get_check_in_result(uuid, uuid),
  public.save_check_in_evidence(uuid, uuid, uuid, text, text, timestamptz, jsonb, text),
  public.aggregate_due_check_ins() to service_role;

commit;
