-- 002: explicit nicotine-use opt-in for the habits page.
-- Stored separately so the app can NEVER infer nicotine use.
-- UNKNOWN (null) is not consent: habits craving support only shows when
-- this is set to 'sometimes'/'yes' or when habit_records exist.
alter table public.life_profiles
  add column if not exists nicotine_status text
  check (nicotine_status in ('no','sometimes','yes','prefer_not'));
