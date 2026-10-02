-- Stripe is the payment system of record. This table is an idempotent local
-- record, written only by the verified webhook using the service-role client.

begin;

create table public.stripe_payment_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text unique,
  stripe_customer_id text,
  stripe_price_id text,
  amount_total bigint check (amount_total is null or amount_total >= 0),
  currency text,
  payment_status text not null,
  fulfilled_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stripe_payment_records_user_created_idx
  on public.stripe_payment_records (user_id, created_at desc);

create trigger set_stripe_payment_records_updated_at
before update on public.stripe_payment_records
for each row execute procedure public.set_updated_at();

alter table public.stripe_payment_records enable row level security;

revoke all on table public.stripe_payment_records from anon, authenticated;
grant select on table public.stripe_payment_records to authenticated;

create policy "Users can view their own Stripe payment records"
  on public.stripe_payment_records for select to authenticated
  using ((select auth.uid()) = user_id);

commit;
