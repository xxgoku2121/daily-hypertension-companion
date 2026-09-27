-- Sleep quality (rested / okay / restless), logged by hand on the Sleep page.
alter table if exists public.daily_metrics
  add column if not exists sleep_quality text;
