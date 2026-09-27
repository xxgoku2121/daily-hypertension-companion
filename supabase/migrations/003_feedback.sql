-- User feedback / feature suggestions
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'suggestion'
    check (category in ('suggestion','problem','praise','other')),
  message text not null check (char_length(message) between 1 and 2000),
  page text,
  created_at timestamptz default now()
);

alter table public.feedback enable row level security;

create policy "owner_insert" on public.feedback for insert
  with check (auth.uid() = user_id);
create policy "owner_read" on public.feedback for select
  using (auth.uid() = user_id);
