import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function authed() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

export interface TimelineEvent {
  id: string
  at: string
  kind: 'bp' | 'medication' | 'food' | 'habit' | 'sleep' | 'activity' | 'appointment'
  icon: string
  title: string
  detail: string | null
  href: string
}

// GET /api/timeline?days=30 -> { events: TimelineEvent[], days }
// One merged, reverse-chronological feed across the app's real data.
export async function GET(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const daysParam = Number(new URL(req.url).searchParams.get('days') ?? 30)
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffIso = cutoff.toISOString()
  const cutoffDate = cutoffIso.slice(0, 10)

  const [bpRes, logsRes, medsRes, foodRes, habitRes, metricsRes, apptRes] = await Promise.all([
    supabase
      .from('bp_readings')
      .select('id, systolic, diastolic, pulse, measured_at, period')
      .eq('user_id', user.id)
      .gte('measured_at', cutoffIso)
      .order('measured_at', { ascending: false })
      .limit(200),
    supabase
      .from('medication_logs')
      .select('id, medication_id, status, logged_at')
      .eq('user_id', user.id)
      .gte('logged_at', cutoffIso)
      .order('logged_at', { ascending: false })
      .limit(200),
    supabase.from('medications').select('id, name').eq('user_id', user.id),
    supabase
      .from('food_records')
      .select('id, meal_name, meal_type, sodium_mg, logged_at')
      .eq('user_id', user.id)
      .gte('logged_at', cutoffIso)
      .order('logged_at', { ascending: false })
      .limit(200),
    supabase
      .from('habit_records')
      .select('id, kind, notes, logged_at')
      .eq('user_id', user.id)
      .gte('logged_at', cutoffIso)
      .order('logged_at', { ascending: false })
      .limit(200),
    supabase
      .from('daily_metrics')
      .select('date, sleep_hours, sleep_quality, walking_minutes, steps')
      .eq('user_id', user.id)
      .gte('date', cutoffDate)
      .order('date', { ascending: false })
      .limit(100),
    supabase
      .from('appointments')
      .select('id, title, date_time, location, status')
      .eq('user_id', user.id)
      .gte('date_time', cutoffIso)
      .order('date_time', { ascending: false })
      .limit(50),
  ])

  const events: TimelineEvent[] = []
  const medNames = new Map(
    ((medsRes.data ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name])
  )

  for (const r of (bpRes.data ?? []) as any[]) {
    events.push({
      id: `bp-${r.id}`,
      at: r.measured_at,
      kind: 'bp',
      icon: '💓',
      title: `Blood pressure ${r.systolic}/${r.diastolic}`,
      detail: `${r.period === 'morning' ? 'Morning' : 'Evening'}${r.pulse ? ` · pulse ${r.pulse}` : ''}`,
      href: '/bp',
    })
  }
  for (const l of (logsRes.data ?? []) as any[]) {
    if (l.status !== 'taken') continue
    events.push({
      id: `med-${l.id}`,
      at: l.logged_at,
      kind: 'medication',
      icon: '💊',
      title: `Took ${medNames.get(l.medication_id) ?? 'medicine'}`,
      detail: null,
      href: '/medications',
    })
  }
  for (const f of (foodRes.data ?? []) as any[]) {
    events.push({
      id: `food-${f.id}`,
      at: f.logged_at,
      kind: 'food',
      icon: '🍽️',
      title: f.meal_name,
      detail: `${f.meal_type ?? 'Meal'}${f.sodium_mg != null ? ` · ${f.sodium_mg} mg sodium` : ' · sodium unknown'}`,
      href: '/food',
    })
  }
  for (const h of (habitRes.data ?? []) as any[]) {
    const label =
      h.kind === 'craving_resisted'
        ? 'Rode out a craving'
        : h.kind === 'smoking_event'
          ? 'Logged nicotine use'
          : h.kind === 'craving_event'
            ? 'Logged a craving'
            : h.kind === 'caffeine_log'
              ? 'Caffeine'
              : h.kind === 'alcohol_log'
                ? 'Alcohol'
                : 'Stress check-in'
    events.push({
      id: `habit-${h.id}`,
      at: h.logged_at,
      kind: 'habit',
      icon: '🌱',
      title: label,
      detail: h.notes,
      href: '/habits',
    })
  }
  for (const m of (metricsRes.data ?? []) as any[]) {
    const bits: string[] = []
    if (m.sleep_hours != null) bits.push(`slept ${m.sleep_hours}h${m.sleep_quality ? ` (${m.sleep_quality})` : ''}`)
    if (m.walking_minutes) bits.push(`${m.walking_minutes} min movement`)
    if (m.steps) bits.push(`${Number(m.steps).toLocaleString()} steps`)
    if (bits.length === 0) continue
    events.push({
      id: `metric-${m.date}`,
      at: `${m.date}T23:59:00Z`,
      kind: m.sleep_hours != null ? 'sleep' : 'activity',
      icon: m.sleep_hours != null ? '😴' : '🚶',
      title: 'Day summary',
      detail: bits.join(' · '),
      href: m.sleep_hours != null ? '/sleep' : '/activity',
    })
  }
  for (const a of (apptRes.data ?? []) as any[]) {
    events.push({
      id: `appt-${a.id}`,
      at: a.date_time,
      kind: 'appointment',
      icon: '📅',
      title: a.title,
      detail: `${a.status === 'done' ? 'Done' : a.status === 'cancelled' ? 'Cancelled' : 'Upcoming'}${a.location ? ` · ${a.location}` : ''}`,
      href: '/appointments',
    })
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  return NextResponse.json({ events: events.slice(0, 300), days })
}
