begin;

create type public.todo_category as enum (
  'urgent_important',
  'important',
  'not_important_not_urgent'
);

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  category public.todo_category not null default 'important',
  is_completed boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint completed_todos_have_a_timestamp check (not is_completed or completed_at is not null)
);

create index todos_user_category_created_idx on public.todos (user_id, category, is_completed, created_at desc);

alter table public.todos enable row level security;
revoke all on table public.todos from anon, authenticated;
grant select, insert, update, delete on table public.todos to authenticated;

create policy "Users can view their own todos"
  on public.todos for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own todos"
  on public.todos for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own todos"
  on public.todos for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own todos"
  on public.todos for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;
