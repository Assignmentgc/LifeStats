begin;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'lifestats-check-in-aggregation',
  '10 * * * *',
  'select public.aggregate_due_check_ins();'
);
commit;
