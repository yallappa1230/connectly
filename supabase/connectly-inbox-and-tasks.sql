-- Connectly inbox and private task capture.
-- Additive only: existing settings and conversations remain intact.

alter table public.conversation_user_settings
  add column if not exists is_pinned boolean not null default false,
  add column if not exists is_archived boolean not null default false;

create index if not exists conversation_user_settings_inbox_idx
  on public.conversation_user_settings (user_id, is_archived, is_pinned, last_read_at);

create table if not exists public.connectly_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);

create index if not exists connectly_tasks_user_status_created_idx
  on public.connectly_tasks (user_id, status, created_at desc);

alter table public.connectly_tasks enable row level security;

drop policy if exists "Users manage their own conversation tasks" on public.connectly_tasks;
create policy "Users manage their own conversation tasks"
  on public.connectly_tasks
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and private.is_conversation_member(conversation_id)
  );

grant select, insert, update, delete on public.connectly_tasks to authenticated;
