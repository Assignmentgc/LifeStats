begin;

alter table public.quest_completions drop constraint quest_completions_xp_awarded_check;
alter table public.quest_completions add constraint quest_completions_xp_awarded_check check (xp_awarded >= 0);

create or replace function public.complete_quest(p_quest_id uuid)
returns table (quest_id uuid, xp_awarded integer, stat_name text, stat_gain integer, new_stat_value integer, total_xp bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_today_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_quest public.quests%rowtype;
  v_gain integer;
  v_xp integer;
  v_value integer;
  v_total bigint;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
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
  select coalesce(sum(amount), 0)::bigint into v_total from public.xp_log where user_id = v_user_id;
  return query select v_quest.id, v_xp, v_quest.tag::text, v_gain, v_value, v_total;
end;
$$;

revoke all on function public.complete_quest(uuid) from public, anon;
grant execute on function public.complete_quest(uuid) to authenticated;
commit;
