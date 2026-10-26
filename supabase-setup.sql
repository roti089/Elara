-- Run this once in Supabase: SQL Editor > New query > paste > Run.
-- It creates one private key/value table that stores every user's dashboard data.

create table if not exists public.elara_user_data (
    user_id    uuid        not null references auth.users(id) on delete cascade,
    key        text        not null,
    value      jsonb       not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, key)
);

alter table public.elara_user_data enable row level security;

-- every user can only see and change their OWN rows
create policy "elara select own" on public.elara_user_data
    for select using (auth.uid() = user_id);
create policy "elara insert own" on public.elara_user_data
    for insert with check (auth.uid() = user_id);
create policy "elara update own" on public.elara_user_data
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "elara delete own" on public.elara_user_data
    for delete using (auth.uid() = user_id);
