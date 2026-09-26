-- Upgrade projects created with the original four-stat character sheet.
-- PostgreSQL enums retain old values, so legacy rows are reassigned rather
-- than attempting to remove the retired labels.

-- Enum additions need their own committed transaction before rows can use the
-- new labels on PostgreSQL versions that defer enum visibility to commit.
begin;

alter type public.stat_tag add value if not exists 'strength';
alter type public.stat_tag add value if not exists 'intellect';
alter type public.stat_tag add value if not exists 'discipline';
alter type public.stat_tag add value if not exists 'purpose';

commit;

begin;

-- Existing auth triggers continue to point at this function, so replace it
-- as part of the upgrade. This keeps every future user on the six-stat model.
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
    (new.id, 'strength'::public.stat_tag, 0),
    (new.id, 'intellect'::public.stat_tag, 0),
    (new.id, 'discipline'::public.stat_tag, 0),
    (new.id, 'social'::public.stat_tag, 0),
    (new.id, 'purpose'::public.stat_tag, 0)
  on conflict (user_id, stat_name) do nothing;

  return new;
end;
$$;

update public.quests
set tag = case tag::text
  when 'career' then 'discipline'::public.stat_tag
  when 'mind' then 'intellect'::public.stat_tag
  else tag
end
where tag::text in ('career', 'mind');

update public.stats
set stat_name = case stat_name::text
  when 'career' then 'discipline'::public.stat_tag
  when 'mind' then 'intellect'::public.stat_tag
  else stat_name
end
where stat_name::text in ('career', 'mind');

insert into public.stats (user_id, stat_name, value)
select auth_user.id, stat.stat_name, 0
from auth.users as auth_user
cross join (
  values
    ('vitality'::public.stat_tag),
    ('strength'::public.stat_tag),
    ('intellect'::public.stat_tag),
    ('discipline'::public.stat_tag),
    ('social'::public.stat_tag),
    ('purpose'::public.stat_tag)
) as stat(stat_name)
on conflict (user_id, stat_name) do nothing;

commit;
