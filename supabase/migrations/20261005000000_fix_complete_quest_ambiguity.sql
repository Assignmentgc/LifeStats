-- `stat_name` is also an output column of complete_quest(), so use the
-- primary-key constraint name rather than an ambiguous conflict column list.
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
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;

  update public.quests
  set is_completed = false
  where user_id = v_user_id and is_daily = true and is_completed = true and completed_at < v_today_start;

  select * into v_quest from public.quests
  where id = p_quest_id and user_id = v_user_id
  for update;

  if not found then raise exception 'Quest not found' using errcode = 'P0002'; end if;
  if not v_quest.is_daily and v_quest.is_completed then raise exception 'Quest has already been completed' using errcode = 'P0001'; end if;
  if v_quest.is_daily and v_quest.completed_at is not null and v_quest.completed_at >= v_today_start then
    raise exception 'Daily quest has already been completed today' using errcode = 'P0001';
  end if;

  insert into public.stats (user_id, stat_name, value)
  values (v_user_id, v_quest.tag, 0)
  on conflict on constraint stats_pkey do nothing;

  v_stat_gain := greatest(1, ceil(v_quest.xp_value::numeric / 10)::integer);

  update public.stats as stat
  set value = least(100, stat.value + v_stat_gain)
  where stat.user_id = v_user_id and stat.stat_name = v_quest.tag
  returning stat.value into v_new_stat_value;

  update public.quests set is_completed = true, completed_at = v_now where id = v_quest.id;

  insert into public.quest_completions (quest_id, user_id, completed_at, completed_on, xp_awarded, stat_gain)
  values (v_quest.id, v_user_id, v_now, (v_now at time zone 'UTC')::date, v_quest.xp_value, v_stat_gain);

  insert into public.xp_log (user_id, amount, source, quest_id)
  values (v_user_id, v_quest.xp_value, 'Quest completed: ' || v_quest.title, v_quest.id);

  select coalesce(sum(log.amount), 0)::bigint into v_total_xp
  from public.xp_log as log where log.user_id = v_user_id;

  return query select v_quest.id, v_quest.xp_value, v_quest.tag::text, v_stat_gain, v_new_stat_value, v_total_xp;
end;
$$;

revoke all on function public.complete_quest(uuid) from public;
grant execute on function public.complete_quest(uuid) to authenticated;
