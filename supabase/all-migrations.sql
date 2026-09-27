-- Daily Hypertension Companion — initial portable schema
-- Multi-user from day one. Every user table has user_id -> auth.users(id).
-- RLS: users can only read/write their own rows.

-- ================= profiles =================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  age int,
  conditions text[] default '{}',
  sodium_target int default 2000,
  step_target int default 6000,
  text_size text default 'normal' check (text_size in ('normal','large','extra_large')),
  appearance text default 'system' check (appearance in ('system','light','blue','dark','high_contrast')),
  reduce_motion boolean default false,
  notifications boolean default true,
  ai_history boolean default true,
  guide_permissions text[] default '{blood_pressure,medication,food,activity,sleep,symptoms}',
  onboarding_state jsonb default '{"status":"not_started"}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ================= blood pressure =================
create table if not exists public.bp_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  systolic int not null check (systolic between 40 and 300),
  diastolic int not null check (diastolic between 30 and 200),
  pulse int check (pulse is null or pulse between 30 and 250),
  measured_at timestamptz not null default now(),
  period text not null default 'morning' check (period in ('morning','evening')),
  source text not null default 'Manual entry',
  device_id uuid,
  confidence numeric,
  verified boolean default true,
  dedup_key text,
  notes text,
  feeling text,
  created_at timestamptz default now()
);
create unique index if not exists bp_readings_dedup on public.bp_readings (user_id, dedup_key) where dedup_key is not null;
create index if not exists bp_readings_user_time on public.bp_readings (user_id, measured_at desc);

-- ================= medications =================
create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dose text,
  frequency text default 'Daily',
  time text default '08:00',
  instructions text,
  instruction_source text default 'user' check (instruction_source in ('prescription','clinician','pharmacist','user')),
  prescriber text,
  prescription_number text,
  prescribed_date date,
  start_date date,
  end_date date,
  prescribed_period text,
  as_needed boolean default false,
  quantity_per_dose numeric,
  pharmacy text,
  pharmacy_phone text,
  pharmacy_address text,
  refill_date date,
  refills_remaining int,
  remaining_pills numeric,
  supply_quantity numeric,
  reminder_delay_minutes int default 60,
  reminder_relation text,
  caregiver_escalation_minutes int,
  active boolean default true,
  archived_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists medications_user on public.medications (user_id) where active;

create table if not exists public.medication_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  status text not null check (status in ('taken','skipped','snoozed','not_taken','unknown')),
  logged_at timestamptz not null default now(),
  scheduled_for timestamptz,
  reminder_sent_at timestamptz,
  notes text,
  created_at timestamptz default now()
);
create index if not exists medication_logs_user_time on public.medication_logs (user_id, logged_at desc);

-- ================= food / metrics =================
create table if not exists public.food_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_name text not null,
  meal_type text,
  portion text,
  sodium_mg int default 0,
  logged_at timestamptz not null default now(),
  notes text
);

create table if not exists public.daily_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  steps int default 0,
  walking_minutes int default 0,
  sleep_hours numeric,
  bedtime text,
  wake_time text,
  unique (user_id, date)
);

create table if not exists public.weight_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weight_kg numeric not null,
  measured_at timestamptz not null default now(),
  source text default 'Manual entry'
);

create table if not exists public.hydration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_ml int not null,
  logged_at timestamptz not null default now()
);

create table if not exists public.stress_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mood text not null check (mood in ('Good','Okay','Not great','Stressed')),
  notes text,
  breathing_cycles int default 0,
  logged_at timestamptz not null default now()
);

-- ================= habits / cravings =================
create table if not exists public.habit_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('smoking_event','craving_event','craving_resisted')),
  trigger text,
  strategy_used text,
  strategy_helped boolean,
  logged_at timestamptz not null default now(),
  notes text
);

create table if not exists public.user_strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger text not null,
  strategy text not null,
  success_count int default 0,
  failure_count int default 0,
  updated_at timestamptz default now(),
  unique (user_id, trigger, strategy)
);

create table if not exists public.barriers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal text not null,
  barrier text not null,
  logged_at timestamptz not null default now(),
  resolved boolean default false
);

-- ================= health guide =================
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  page_context text,
  created_at timestamptz default now()
);
create index if not exists ai_messages_user_time on public.ai_messages (user_id, created_at);

create table if not exists public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  requested_params jsonb,
  confirmation_status text default 'pending' check (confirmation_status in ('pending','confirmed','cancelled','executed','failed')),
  execution_result jsonb,
  created_at timestamptz default now()
);

-- ================= planning =================
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  date_time timestamptz not null,
  location text,
  doctor text,
  notes text,
  transport_needed boolean default false,
  status text default 'upcoming' check (status in ('upcoming','done','cancelled'))
);

create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  time text not null,
  kind text not null,
  title text not null,
  status text default 'pending' check (status in ('pending','done','skipped')),
  source text default 'routine' check (source in ('routine','ai','user','appointment')),
  flexible boolean default true,
  notes text
);
create index if not exists schedule_user_date on public.schedule_events (user_id, date);

create table if not exists public.daily_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  kind text not null,
  label text not null,
  completed boolean default false,
  sort_order int default 0
);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  trigger_desc text,
  action_desc text,
  active boolean default true,
  last_triggered_at timestamptz,
  created_from text default 'user' check (created_from in ('ai','user'))
);

create table if not exists public.automation_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid references public.automation_rules(id) on delete set null,
  triggered_at timestamptz default now(),
  result text check (result in ('completed','skipped','failed')),
  detail text
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  action_completed_at timestamptz
);

create table if not exists public.job_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null,
  automation_id uuid,
  scheduled_at timestamptz not null,
  executed_at timestamptz,
  status text not null check (status in ('pending','success','failed','skipped')),
  result text,
  failure_reason text,
  retry_count int default 0
);

-- ================= reports / questions =================
create table if not exists public.health_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('doctor_report','weekly_review')),
  period_start date,
  period_end date,
  content jsonb,
  generated_at timestamptz default now()
);

create table if not exists public.doctor_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  source text default 'user' check (source in ('ai_suggested','user')),
  status text default 'kept' check (status in ('kept','removed','asked')),
  created_at timestamptz default now()
);

-- ================= evidence (shared, read-only for users) =================
create table if not exists public.evidence_sources (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  claim text not null,
  source_name text not null,
  source_title text,
  source_url text not null,
  evidence_type text,
  published_date date,
  last_verified date,
  population text,
  limitations text,
  status text default 'active'
);

-- ================= devices =================
create table if not exists public.device_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('blood_pressure_monitor','health_platform','wearable','scale','pulse_oximeter')),
  name text not null,
  status text default 'disconnected' check (status in ('connected','available_later','disconnected')),
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  sync_error text,
  battery int,
  device_type text,
  manufacturer text,
  model text
);

-- ================= care =================
create table if not exists public.care_team (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  name text not null,
  phone text,
  address text,
  notes text
);

create table if not exists public.caregiver_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relationship text,
  permissions text[] default '{}',
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.caregiver_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  caregiver_name text not null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz default now()
);

create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relationship text,
  phone text not null,
  active boolean default true
);

create table if not exists public.health_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal text not null,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.life_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wake_time text,
  bedtime text,
  meal_times jsonb,
  routine_notes text,
  mobility_notes text,
  setup_by text default 'user' check (setup_by in ('user','caregiver')),
  updated_at timestamptz default now()
);

create table if not exists public.daily_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  state text default 'normal' check (state in ('normal','busy','traveling','sick','low_energy','high_stress','appointment_day','recovery_mode')),
  notes text,
  unique (user_id, date)
);

create table if not exists public.safety_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  systolic_over int default 180,
  diastolic_over int default 120,
  symptoms text[] default '{}',
  source_url text,
  version text,
  unique (user_id)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  details jsonb,
  created_at timestamptz default now()
);

-- ================= RLS =================
alter table public.profiles enable row level security;
alter table public.bp_readings enable row level security;
alter table public.medications enable row level security;
alter table public.medication_logs enable row level security;
alter table public.food_records enable row level security;
alter table public.daily_metrics enable row level security;
alter table public.weight_records enable row level security;
alter table public.hydration_logs enable row level security;
alter table public.stress_logs enable row level security;
alter table public.habit_records enable row level security;
alter table public.user_strategies enable row level security;
alter table public.barriers enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_actions enable row level security;
alter table public.appointments enable row level security;
alter table public.schedule_events enable row level security;
alter table public.daily_tasks enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_activity enable row level security;
alter table public.notifications enable row level security;
alter table public.job_executions enable row level security;
alter table public.health_reports enable row level security;
alter table public.doctor_questions enable row level security;
alter table public.device_connections enable row level security;
alter table public.care_team enable row level security;
alter table public.caregiver_permissions enable row level security;
alter table public.caregiver_audit enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.health_goals enable row level security;
alter table public.life_profiles enable row level security;
alter table public.daily_contexts enable row level security;
alter table public.safety_rules enable row level security;
alter table public.audit_events enable row level security;
alter table public.evidence_sources enable row level security;

-- owner-only policies for user tables
do $$
declare t text;
begin
  foreach t in array array[
    'bp_readings','medications','medication_logs','food_records',
    'daily_metrics','weight_records','hydration_logs','stress_logs','habit_records',
    'user_strategies','barriers','ai_messages','ai_actions','appointments',
    'schedule_events','daily_tasks','automation_rules','automation_activity',
    'notifications','job_executions','health_reports','doctor_questions',
    'device_connections','care_team','caregiver_permissions','caregiver_audit',
    'emergency_contacts','health_goals','life_profiles','daily_contexts',
    'safety_rules','audit_events'
  ]
  loop
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format('create policy "owner_all" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- profiles uses id = auth.uid()
create policy "owner_all" on public.profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

-- evidence: readable by all authenticated users, writable by none (seeded via SQL)
create policy "evidence_read" on public.evidence_sources for select
  using (auth.role() = 'authenticated');

-- seed default safety rule note: per-user rows are created by the app on signup
-- seed evidence sources (AHA/CDC/NHLBI/Mayo)
insert into public.evidence_sources (topic, claim, source_name, source_title, source_url, evidence_type, published_date, last_verified, status) values
('blood_pressure','Normal blood pressure is less than 120/80 mmHg.','American Heart Association','Understanding Blood Pressure Readings','https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings','guideline','2024-01-01'::date,'2026-09-27'::date,'active'),
('blood_pressure','High blood pressure is 130/80 mmHg or higher.','American Heart Association','Understanding Blood Pressure Readings','https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings','guideline','2024-01-01'::date,'2026-09-27'::date,'active'),
('blood_pressure','A hypertensive crisis (over 180/120) needs prompt medical attention, especially with symptoms.','American Heart Association','Understanding Blood Pressure Readings','https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings','guideline','2024-01-01'::date,'2026-09-27'::date,'active'),
('sodium','Adults should limit sodium to less than 2,300 mg per day; moving toward 1,500 mg can further help blood pressure.','American Heart Association','How Much Sodium Per Day?','https://www.heart.org/en/healthy-living/healthy-eating/eat-smart/sodium/how-much-sodium-per-day','guideline','2024-01-01'::date,'2026-09-27'::date,'active'),
('activity','Adults should get at least 150 minutes of moderate-intensity aerobic activity per week.','CDC','Physical Activity Guidelines','https://www.cdc.gov/physical-activity/php/guidelines/index.html','guideline','2024-01-01'::date,'2026-09-27'::date,'active'),
('lifestyle','The DASH eating pattern can help lower blood pressure.','NHLBI','DASH Eating Plan','https://www.nhlbi.nih.gov/education/dash-eating-plan','guideline','2024-01-01'::date,'2026-09-27'::date,'active'),
('smoking','Smoking raises blood pressure temporarily and quitting lowers cardiovascular risk.','CDC','Smoking and Tobacco Use','https://www.cdc.gov/tobacco/about/index.html','guideline','2024-01-01'::date,'2026-09-27'::date,'active'),
('measurement','Measure BP while seated with back supported, feet flat, arm at heart level, after resting 5 minutes.','American Heart Association','Monitoring Your Blood Pressure at Home','https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/monitoring-your-blood-pressure-at-home','guideline','2024-01-01'::date,'2026-09-27'::date,'active');
-- 002: explicit nicotine-use opt-in for the habits page.
-- Stored separately so the app can NEVER infer nicotine use.
-- UNKNOWN (null) is not consent: habits craving support only shows when
-- this is set to 'sometimes'/'yes' or when habit_records exist.
alter table public.life_profiles
  add column if not exists nicotine_status text
  check (nicotine_status in ('no','sometimes','yes','prefer_not'));
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
