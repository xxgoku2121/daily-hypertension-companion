-- 007_device_connections_created_at.sql
-- The /api/devices route orders device_connections by created_at, but the
-- initial schema never created that column. Add it (idempotent).

alter table public.device_connections
  add column if not exists created_at timestamptz not null default now();
