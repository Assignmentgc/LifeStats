-- LifeStats v2: preserve the legacy stat rows, then add direct substat scores.
-- Base stats are now derived only from their active substats.
begin;
alter type public.stat_tag add value if not exists 'finances';
alter type public.stat_tag add value if not exists 'environment';
commit;

begin;

create table public.lifestats_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  spirituality_enabled boolean not null default true,
  include_spirituality_in_life_score boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint spirituality_lifescore_requires_tracking
    check (spirituality_enabled or not include_spirituality_in_life_score)
);

create table public.stat_subscores (
  user_id uuid not null references auth.users (id) on delete cascade,
  substat_id text not null check (substat_id in (
    'direction','goals','values','meaning','contribution',
    'fitness','nutrition','sleep','energy','mental_wellbeing','intellectual_growth','emotional_regulation',
    'family','friends','communication','community','social_life','social_confidence',
    'income','saving','spending','investing','financial_security','career','professional_growth',
    'consistency','self_control','focus','habits','execution','initiative','time_management',
    'living_space','digital_environment','experiences','recreation','hobbies','nature','spirituality'
  )),
  value integer not null default 0 check (value between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, substat_id)
);

alter table public.quests add column substat_id text;

-- Legacy quests remain valid and are mapped to the closest direct substat.
update public.quests
set substat_id = case tag::text
  when 'vitality' then 'energy' when 'strength' then 'fitness'
  when 'intellect' then 'intellectual_growth' when 'discipline' then 'habits'
  when 'social' then 'social_life' when 'purpose' then 'goals'
  else 'goals'
end
where substat_id is null;
alter table public.quests alter column substat_id set not null;
alter table public.quests add constraint quests_substat_id_valid check (substat_id in (
  'direction','goals','values','meaning','contribution',
  'fitness','nutrition','sleep','energy','mental_wellbeing','intellectual_growth','emotional_regulation',
  'family','friends','communication','community','social_life','social_confidence',
  'income','saving','spending','investing','financial_security','career','professional_growth',
  'consistency','self_control','focus','habits','execution','initiative','time_management',
  'living_space','digital_environment','experiences','recreation','hobbies','nature','spirituality'
));

create index stat_subscores_user_updated_idx on public.stat_subscores (user_id, updated_at desc);

-- Seed all requested substats. Existing legacy values are retained in stats and
-- copied into their closest new equivalent rather than discarded.
insert into public.stat_subscores (user_id, substat_id, value)
select auth_user.id, substat.substat_id, 0
from auth.users auth_user cross join (values
  ('direction'),('goals'),('values'),('meaning'),('contribution'),
  ('fitness'),('nutrition'),('sleep'),('energy'),('mental_wellbeing'),('intellectual_growth'),('emotional_regulation'),
  ('family'),('friends'),('communication'),('community'),('social_life'),('social_confidence'),
  ('income'),('saving'),('spending'),('investing'),('financial_security'),('career'),('professional_growth'),
  ('consistency'),('self_control'),('focus'),('habits'),('execution'),('initiative'),('time_management'),
  ('living_space'),('digital_environment'),('experiences'),('recreation'),('hobbies'),('nature'),('spirituality')
) as substat(substat_id)
on conflict (user_id, substat_id) do nothing;

update public.stat_subscores target set value = source.value
from public.stats source where source.user_id = target.user_id
  and ((source.stat_name::text = 'purpose' and target.substat_id in ('direction','goals','values','meaning','contribution'))
    or (source.stat_name::text = 'discipline' and target.substat_id in ('consistency','self_control','focus','habits','execution','initiative','time_management'))
    or (source.stat_name::text = 'social' and target.substat_id in ('family','friends','communication','community','social_life','social_confidence'))
    or (source.stat_name::text = 'vitality' and target.substat_id = 'energy')
    or (source.stat_name::text = 'strength' and target.substat_id = 'fitness')
    or (source.stat_name::text = 'intellect' and target.substat_id = 'intellectual_growth'));

-- Keep future users on the new six Base Stats and all direct substats.
create or replace function public.seed_stats_for_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.stats (user_id, stat_name, value) values
    (new.id, 'purpose', 0), (new.id, 'vitality', 0), (new.id, 'social', 0),
    (new.id, 'finances', 0), (new.id, 'discipline', 0), (new.id, 'environment', 0)
  on conflict on constraint stats_pkey do nothing;
  insert into public.lifestats_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.stat_subscores (user_id, substat_id)
  select new.id, substat_id from (values
    ('direction'),('goals'),('values'),('meaning'),('contribution'),
    ('fitness'),('nutrition'),('sleep'),('energy'),('mental_wellbeing'),('intellectual_growth'),('emotional_regulation'),
    ('family'),('friends'),('communication'),('community'),('social_life'),('social_confidence'),
    ('income'),('saving'),('spending'),('investing'),('financial_security'),('career'),('professional_growth'),
    ('consistency'),('self_control'),('focus'),('habits'),('execution'),('initiative'),('time_management'),
    ('living_space'),('digital_environment'),('experiences'),('recreation'),('hobbies'),('nature'),('spirituality')
  ) as substat(substat_id) on conflict (user_id, substat_id) do nothing;
  return new;
end;
$$;

insert into public.lifestats_settings (user_id) select id from auth.users on conflict (user_id) do nothing;
insert into public.stats (user_id, stat_name, value)
select auth_user.id, stat.stat_name, 0 from auth.users auth_user cross join (values
  ('purpose'::public.stat_tag),('vitality'::public.stat_tag),('social'::public.stat_tag),
  ('finances'::public.stat_tag),('discipline'::public.stat_tag),('environment'::public.stat_tag)
) as stat(stat_name) on conflict on constraint stats_pkey do nothing;

create or replace function public.recalculate_base_stat(p_user_id uuid, p_base_stat public.stat_tag)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_value integer;
begin
  select coalesce(round(avg(score.value))::integer, 0) into v_value
  from public.stat_subscores score
  where score.user_id = p_user_id and (
    (p_base_stat::text = 'purpose' and score.substat_id in ('direction','goals','values','meaning','contribution')) or
    (p_base_stat::text = 'vitality' and score.substat_id in ('fitness','nutrition','sleep','energy','mental_wellbeing','intellectual_growth','emotional_regulation')) or
    (p_base_stat::text = 'social' and score.substat_id in ('family','friends','communication','community','social_life','social_confidence')) or
    (p_base_stat::text = 'finances' and score.substat_id in ('income','saving','spending','investing','financial_security','career','professional_growth')) or
    (p_base_stat::text = 'discipline' and score.substat_id in ('consistency','self_control','focus','habits','execution','initiative','time_management')) or
    (p_base_stat::text = 'environment' and score.substat_id in ('living_space','digital_environment','experiences','recreation','hobbies','nature') or (score.substat_id = 'spirituality' and exists (select 1 from public.lifestats_settings s where s.user_id = p_user_id and s.spirituality_enabled)))
  );
  insert into public.stats (user_id, stat_name, value) values (p_user_id, p_base_stat, v_value)
  on conflict on constraint stats_pkey do update set value = excluded.value;
  return v_value;
end;
$$;

-- Recalculate all new base rows from active substats once after migration.
do $$ declare u record; s public.stat_tag; begin
  for u in select id from auth.users loop
    foreach s in array array['purpose'::public.stat_tag,'vitality'::public.stat_tag,'social'::public.stat_tag,'finances'::public.stat_tag,'discipline'::public.stat_tag,'environment'::public.stat_tag] loop
      perform public.recalculate_base_stat(u.id, s);
    end loop;
  end loop;
end $$;

create or replace function public.apply_ai_check_in(p_content text, p_summary text, p_adjustments jsonb, p_qol_score integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user_id uuid := auth.uid(); v_adjustment jsonb; v_substat text; v_base public.stat_tag; v_change integer; v_seen text[] := '{}';
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if char_length(btrim(p_content)) not between 3 and 5000 or char_length(btrim(p_summary)) not between 1 and 500 or p_qol_score not between 0 and 100 then raise exception 'Invalid check-in'; end if;
  if jsonb_typeof(p_adjustments) is distinct from 'array' or jsonb_array_length(p_adjustments) > 12 then raise exception 'Invalid check-in adjustments'; end if;
  for v_adjustment in select value from jsonb_array_elements(p_adjustments) loop
    v_substat := v_adjustment ->> 'substat_id'; v_change := (v_adjustment ->> 'change')::integer;
    if v_substat not in ('direction','goals','values','meaning','contribution','fitness','nutrition','sleep','energy','mental_wellbeing','intellectual_growth','emotional_regulation','family','friends','communication','community','social_life','social_confidence','income','saving','spending','investing','financial_security','career','professional_growth','consistency','self_control','focus','habits','execution','initiative','time_management','living_space','digital_environment','experiences','recreation','hobbies','nature','spirituality') or v_change not between -5 and 5 or v_substat = any(v_seen) or (v_substat = 'spirituality' and not (select spirituality_enabled from public.lifestats_settings where user_id = v_user_id)) then raise exception 'Invalid substat adjustment'; end if;
    v_seen := array_append(v_seen, v_substat);
    v_base := case when v_substat in ('direction','goals','values','meaning','contribution') then 'purpose'::public.stat_tag when v_substat in ('fitness','nutrition','sleep','energy','mental_wellbeing','intellectual_growth','emotional_regulation') then 'vitality'::public.stat_tag when v_substat in ('family','friends','communication','community','social_life','social_confidence') then 'social'::public.stat_tag when v_substat in ('income','saving','spending','investing','financial_security','career','professional_growth') then 'finances'::public.stat_tag when v_substat in ('consistency','self_control','focus','habits','execution','initiative','time_management') then 'discipline'::public.stat_tag else 'environment'::public.stat_tag end;
    update public.stat_subscores set value = greatest(0, least(100, value + v_change)) where user_id = v_user_id and substat_id = v_substat;
    perform public.recalculate_base_stat(v_user_id, v_base);
  end loop;
  insert into public.ai_check_ins (user_id, content, summary, adjustments) values (v_user_id, btrim(p_content), btrim(p_summary), p_adjustments);
  insert into public.qol_scores (user_id, score) values (v_user_id, p_qol_score);
end;
$$;

create or replace function public.complete_quest(p_quest_id uuid)
returns table (quest_id uuid, xp_awarded integer, stat_name text, stat_gain integer, new_stat_value integer, total_xp bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user_id uuid := auth.uid(); v_now timestamptz := now(); v_today_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'; v_quest public.quests%rowtype; v_gain integer; v_value integer; v_total bigint;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  update public.quests set is_completed = false where user_id = v_user_id and is_daily and is_completed and completed_at < v_today_start;
  select * into v_quest from public.quests where id = p_quest_id and user_id = v_user_id for update;
  if not found then raise exception 'Quest not found'; end if;
  if v_quest.is_completed and (not v_quest.is_daily or v_quest.completed_at >= v_today_start) then raise exception 'Quest has already been completed'; end if;
  v_gain := greatest(1, ceil(v_quest.xp_value::numeric / 10)::integer);
  update public.stat_subscores set value = least(100, value + v_gain) where user_id = v_user_id and substat_id = v_quest.substat_id;
  v_value := public.recalculate_base_stat(v_user_id, v_quest.tag);
  update public.quests set is_completed = true, completed_at = v_now where id = v_quest.id;
  insert into public.quest_completions (quest_id,user_id,completed_at,completed_on,xp_awarded,stat_gain) values (v_quest.id,v_user_id,v_now,(v_now at time zone 'UTC')::date,v_quest.xp_value,v_gain);
  insert into public.xp_log (user_id,amount,source,quest_id) values (v_user_id,v_quest.xp_value,'Quest completed: ' || v_quest.title,v_quest.id);
  select coalesce(sum(amount),0)::bigint into v_total from public.xp_log where user_id = v_user_id;
  return query select v_quest.id,v_quest.xp_value,v_quest.tag::text,v_gain,v_value,v_total;
end;
$$;

create or replace function public.refresh_environment_after_settings_change() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$ begin perform public.recalculate_base_stat(new.user_id, 'environment'); return new; end; $$;
create trigger refresh_environment_after_settings_change after update of spirituality_enabled on public.lifestats_settings for each row execute procedure public.refresh_environment_after_settings_change();

alter table public.lifestats_settings enable row level security;
alter table public.stat_subscores enable row level security;
revoke all on public.lifestats_settings, public.stat_subscores from anon, authenticated;
grant select, insert, update on public.lifestats_settings to authenticated;
grant select on public.stat_subscores to authenticated;
create policy "Users can view their LifeStats settings" on public.lifestats_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can add their LifeStats settings" on public.lifestats_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their LifeStats settings" on public.lifestats_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can view their substat scores" on public.stat_subscores for select to authenticated using ((select auth.uid()) = user_id);

revoke all on function public.apply_ai_check_in(text, text, jsonb, integer) from public;
grant execute on function public.apply_ai_check_in(text, text, jsonb, integer) to authenticated;
revoke all on function public.complete_quest(uuid) from public;
grant execute on function public.complete_quest(uuid) to authenticated;
commit;
