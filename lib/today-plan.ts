import type { SupabaseClient } from '@supabase/supabase-js'
import { getBpWindows, toMinutes, formatWindowTime } from './next-action'
import { zonedDayBounds } from './day'

/* ============================================================
   Today plan — the ONE state source behind the Home "Today" list.
   Draws from the same sources as the Next Best Action engine:
     BP routine windows + today's readings
     medication schedules + today's logs
     daily_tasks (Health Guide reminders)
     appointments today
   So "Today" can never say "nothing scheduled" while the engine
   says "take your morning BP".
   ============================================================ */

export interface TodayPlanItem {
  id: string
  icon: string
  label: string
  meta: string
  href: string
  done: boolean
}

interface OnboardingState {
  bp_morning_time?: string
  bp_evening_time?: string
}

function fmtTime(hhmm: string | null | undefined): string {
  const m = toMinutes(hhmm)
  return m === null ? '' : formatWindowTime(m)
}

export async function getTodayPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<TodayPlanItem[]> {
  const { data: tzRow } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single()
  const tz = (tzRow as { timezone?: string | null } | null)?.timezone ?? null
  const { date: today, startIso: dayStart, endIso: dayEnd } = zonedDayBounds(tz)

  const [profileRes, lifeRes, bpRes, medsRes, logsRes, tasksRes, apptsRes] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('onboarding_state')
        .eq('id', userId)
        .single(),
      supabase
        .from('life_profiles')
        .select('wake_time, bedtime')
        .eq('user_id', userId)
        .single(),
      supabase
        .from('bp_readings')
        .select('period')
        .eq('user_id', userId)
        .gte('measured_at', dayStart),
      supabase
        .from('medications')
        .select('id, name, dose, time, frequency, as_needed')
        .eq('user_id', userId)
        .eq('active', true)
        .order('time', { ascending: true }),
      supabase
        .from('medication_logs')
        .select('medication_id, status')
        .eq('user_id', userId)
        .gte('logged_at', dayStart),
      supabase
        .from('daily_tasks')
        .select('id, label, kind, completed')
        .eq('user_id', userId)
        .eq('date', today)
        .order('created_at', { ascending: true }),
      supabase
        .from('appointments')
        .select('id, title, date_time, location')
        .eq('user_id', userId)
        .eq('status', 'upcoming')
        .gte('date_time', dayStart)
        .lte('date_time', dayEnd)
        .order('date_time', { ascending: true }),
    ])

  const items: TodayPlanItem[] = []
  const onboarding = (profileRes.data?.onboarding_state ?? {}) as OnboardingState
  const life = (lifeRes.data ?? null) as {
    wake_time?: string | null
    bedtime?: string | null
  } | null

  // BP routine — same windows the engine uses.
  // The engine always has default windows (7–11 AM / 6–10 PM), so the
  // morning/evening checks are always part of the routine; explicit times
  // only narrow the suggested window.
  const periods = new Set(
    ((bpRes.data ?? []) as { period: string }[]).map((r) => r.period)
  )
  const windows = getBpWindows(onboarding, life)
  {
    items.push({
      id: 'bp-morning',
      icon: '🌅',
      label: 'Morning blood pressure',
      meta: periods.has('morning')
        ? 'Done'
        : `Around ${formatWindowTime(windows.morning[0])}`,
      href: '/bp',
      done: periods.has('morning'),
    })
    items.push({
      id: 'bp-evening',
      icon: '🌙',
      label: 'Evening blood pressure',
      meta: periods.has('evening')
        ? 'Done'
        : `Around ${formatWindowTime(windows.evening[0])}`,
      href: '/bp',
      done: periods.has('evening'),
    })
  }

  // Medications due today.
  const takenCount = new Map<string, number>()
  for (const l of ((logsRes.data ?? []) as {
    medication_id: string
    status: string
  }[])) {
    if (l.status !== 'taken') continue
    takenCount.set(l.medication_id, (takenCount.get(l.medication_id) ?? 0) + 1)
  }
  const expectedDoses = (frequency: string | null | undefined): number => {
    const f = (frequency || '').toLowerCase()
    if (f.includes('twice')) return 2
    if (f.includes('three')) return 3
    return 1
  }
  for (const m of ((medsRes.data ?? []) as {
    id: string
    name: string
    dose: string | null
    time: string | null
    frequency: string | null
    as_needed: boolean
  }[])) {
    if (m.as_needed) continue
    const taken = takenCount.get(m.id) ?? 0
    const expected = expectedDoses(m.frequency)
    const done = taken >= expected
    const meta = done
      ? `Taken${m.time ? ` · ${fmtTime(m.time)}` : ''}`
      : taken > 0 && expected > 1
        ? `${taken} of ${expected} doses taken`
        : `${m.dose ? `${m.dose} · ` : ''}${m.time ? fmtTime(m.time) : 'Today'}`
    items.push({
      id: `med-${m.id}`,
      icon: '💊',
      label: m.name,
      meta,
      href: '/medications',
      done,
    })
  }

  // Reminders / tasks (Health Guide "remind me later").
  for (const t of ((tasksRes.data ?? []) as {
    id: string
    label: string
    kind: string
    completed: boolean
  }[])) {
    items.push({
      id: `task-${t.id}`,
      icon: t.kind === 'reminder' ? '⏰' : '📝',
      label: t.label,
      meta: t.completed ? 'Done' : 'Reminder',
      href: '/guide',
      done: t.completed,
    })
  }

  // Appointments today.
  for (const a of ((apptsRes.data ?? []) as {
    id: string
    title: string
    date_time: string
    location: string | null
  }[])) {
    const t = new Date(a.date_time)
    items.push({
      id: `appt-${a.id}`,
      icon: '📅',
      label: a.title,
      meta: `${t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${a.location ? ` · ${a.location}` : ''}`,
      href: '/appointments',
      done: false,
    })
  }

  // Done items sink to the bottom; keep the list short.
  items.sort((a, b) => Number(a.done) - Number(b.done))
  return items.slice(0, 8)
}

/* ---- At-a-glance summary for Home's second column ---- */

export interface AtAGlance {
  latestBp: { systolic: number; diastolic: number; when: string } | null
  meds: { taken: number; total: number } | null
  movement: { steps: number | null; minutes: number | null } | null
  nextAppointment: { title: string; when: string } | null
}

export async function getAtAGlance(
  supabase: SupabaseClient,
  userId: string
): Promise<AtAGlance> {
  const { data: tzRow } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single()
  const tz = (tzRow as { timezone?: string | null } | null)?.timezone ?? null
  const { date: today, startIso: dayStart } = zonedDayBounds(tz)
  const [bpRes, medsRes, logsRes, metricsRes, apptRes] = await Promise.all([
    supabase
      .from('bp_readings')
      .select('systolic, diastolic, measured_at')
      .eq('user_id', userId)
      .order('measured_at', { ascending: false })
      .limit(1),
    supabase
      .from('medications')
      .select('id')
      .eq('user_id', userId)
      .eq('active', true)
      .eq('as_needed', false),
    supabase
      .from('medication_logs')
      .select('medication_id, status')
      .eq('user_id', userId)
      .gte('logged_at', dayStart),
    supabase
      .from('daily_metrics')
      .select('steps, walking_minutes')
      .eq('user_id', userId)
      .eq('date', today)
      .single(),
    supabase
      .from('appointments')
      .select('title, date_time')
      .eq('user_id', userId)
      .eq('status', 'upcoming')
      .gte('date_time', new Date().toISOString())
      .order('date_time', { ascending: true })
      .limit(1),
  ])

  const bp = (bpRes.data ?? [])[0] as
    | { systolic: number; diastolic: number; measured_at: string }
    | undefined
  const medIds = ((medsRes.data ?? []) as { id: string }[]).map((m) => m.id)
  const takenToday = new Set(
    ((logsRes.data ?? []) as { medication_id: string; status: string }[])
      .filter((l) => l.status === 'taken' && medIds.includes(l.medication_id))
      .map((l) => l.medication_id)
  )
  const metrics = metricsRes.data as {
    steps?: number | null
    walking_minutes?: number | null
  } | null
  const appt = (apptRes.data ?? [])[0] as
    | { title: string; date_time: string }
    | undefined

  return {
    latestBp: bp
      ? {
          systolic: bp.systolic,
          diastolic: bp.diastolic,
          when: new Date(bp.measured_at).toLocaleDateString([], {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
          }),
        }
      : null,
    meds:
      medIds.length > 0
        ? { taken: takenToday.size, total: medIds.length }
        : null,
    movement:
      metrics && (metrics.steps != null || metrics.walking_minutes != null)
        ? { steps: metrics.steps ?? null, minutes: metrics.walking_minutes ?? null }
        : null,
    nextAppointment: appt
      ? {
          title: appt.title,
          when: new Date(appt.date_time).toLocaleDateString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }),
        }
      : null,
  }
}
