-- Habits & Routines: optional caffeine / alcohol / stress modules.
-- Nothing is assumed: modules are off until the person enables them.
alter table if exists public.profiles
  add column if not exists routine_modules text[] default '{}';

alter table if exists public.habit_records
  drop constraint if exists habit_records_kind_check;
alter table if exists public.habit_records
  add constraint habit_records_kind_check
  check (kind in (
    'smoking_event', 'craving_event', 'craving_resisted',
    'caffeine_log', 'alcohol_log', 'stress_checkin'
  ));
