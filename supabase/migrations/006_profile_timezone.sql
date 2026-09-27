-- Store the person's IANA timezone so "today" means their day, not UTC.
alter table if exists public.profiles
  add column if not exists timezone text;
