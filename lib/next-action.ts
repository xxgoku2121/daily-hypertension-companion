import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextAction } from './types'

/* ============================================================
   Next Best Action decision engine (server-side).
   Returns exactly ONE action for the Home screen, in priority order:
     safety_review > appointment_prep > medication > bp_morning/bp_evening
     > craving_support > activity > check_in > caught_up
   Honesty rule: UNKNOWN IS NOT YES. Branches that need personal facts
   (smoking, pain, appointments, meds) are skipped when the data is
   absent — nothing is invented.
   ============================================================ */

interface OnboardingState {
  status?: 'not_started' | 'in_progress' | 'done'
  step?: number
  bp_morning_time?: string
  bp_evening_time?: string
}

interface BpRow {
  systolic: number
  diastolic: number
  measured_at: string
  period: 'morning' | 'evening'
}

interface MedRow {
  id: string
  name: string
  dose: string | null
  time: string
  as_needed: boolean
}

interface MedLogRow {
  medication_id: string
  status: string
}

interface ApptRow {
  id: string
  title: string
  date_time: string
  location: string | null
}

/* ---- time helpers (UTC day boundaries; see note in getNextAction) ---- */

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

function todayStartIso(): string {
  return `${todayDateString()}T00:00:00.000Z`
}

function nowMinutesUtc(): number {
  const d = new Date()
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

/** 'HH:MM' -> minutes since midnight, or null when unparseable. */
function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim())
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

export async function getNextAction(
  supabase: SupabaseClient,
  userId: string
): Promise<NextAction> {
  // NOTE: day boundaries use UTC. A future version should store the user's
  // timezone in profiles and compute local boundaries instead.
  const today = todayDateString()
  const dayStart = todayStartIso()
  const nowIso = new Date().toISOString()
  const nowMin = nowMinutesUtc()

  const [
    profileRes,
    safetyRes,
    bpRes,
    medsRes,
    logsRes,
    apptsRes,
    habitsRes,
    contextRes,
    barriersRes,
    stressRes,
    metricsRes,
    lifeRes,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('step_target, onboarding_state')
      .eq('id', userId)
      .single(),
    supabase
      .from('safety_rules')
      .select('systolic_over, diastolic_over')
      .eq('user_id', userId)
      .single(),
    supabase
      .from('bp_readings')
      .select('systolic, diastolic, measured_at, period')
      .eq('user_id', userId)
      .gte('measured_at', dayStart)
      .order('measured_at', { ascending: false }),
    supabase
      .from('medications')
      .select('id, name, dose, time, as_needed')
      .eq('user_id', userId)
      .eq('active', true),
    supabase
      .from('medication_logs')
      .select('medication_id, status')
      .eq('user_id', userId)
      .gte('logged_at', dayStart),
    supabase
      .from('appointments')
      .select('id, title, date_time, location')
      .eq('user_id', userId)
      .eq('status', 'upcoming')
      .gte('date_time', nowIso)
      .order('date_time', { ascending: true })
      .limit(5),
    supabase
      .from('habit_records')
      .select('id')
      .eq('user_id', userId)
      .gte('logged_at', dayStart)
      .in('kind', ['smoking_event', 'craving_event'])
      .limit(1),
    supabase
      .from('daily_contexts')
      .select('state')
      .eq('user_id', userId)
      .eq('date', today)
      .single(),
    supabase
      .from('barriers')
      .select('barrier')
      .eq('user_id', userId)
      .eq('resolved', false),
    supabase
      .from('stress_logs')
      .select('id')
      .eq('user_id', userId)
      .gte('logged_at', dayStart)
      .limit(1),
    supabase
      .from('daily_metrics')
      .select('steps, walking_minutes')
      .eq('user_id', userId)
      .eq('date', today)
      .single(),
    supabase
      .from('life_profiles')
      .select('wake_time, bedtime')
      .eq('user_id', userId)
      .single(),
  ])

  const onboarding = (profileRes.data?.onboarding_state ?? {}) as OnboardingState
  const readings = ((bpRes.data ?? []) as BpRow[]).filter(
    (r) => typeof r.systolic === 'number' && typeof r.diastolic === 'number'
  )

  /* ---- 1. Safety: unresolved high-reading symptom review ---- */
  const sysOver = safetyRes.data?.systolic_over ?? 180
  const diaOver = safetyRes.data?.diastolic_over ?? 120
  const highs = readings.filter(
    (r) => r.systolic > sysOver || r.diastolic > diaOver
  )
  if (highs.length > 0) {
    const latestHigh = highs.reduce((a, b) =>
      a.measured_at > b.measured_at ? a : b
    )
    const { data: reviews } = await supabase
      .from('audit_events')
      .select('id')
      .eq('user_id', userId)
      .eq('action', 'symptom_review_completed')
      .gte('created_at', latestHigh.measured_at)
      .limit(1)
    if (!reviews || reviews.length === 0) {
      return {
        kind: 'safety_review',
        title: 'Review your symptoms',
        detail: `Your reading of ${latestHigh.systolic}/${latestHigh.diastolic} was above your safety limit (${sysOver}/${diaOver}). Let's check how you're feeling.`,
        cta_label: 'Review symptoms',
        cta_href: '/get-help',
        why: 'A very high reading needs a quick symptom check.',
      }
    }
  }

  /* ---- 2. Appointment starting within 3 hours ---- */
  const upcoming = ((apptsRes.data ?? []) as ApptRow[]).filter(
    (a) => a.date_time >= nowIso
  )
  const soonAppt = upcoming.find(
    (a) => new Date(a.date_time).getTime() - Date.now() <= 3 * 3600 * 1000
  )
  if (soonAppt) {
    const t = new Date(soonAppt.date_time)
    const timeStr = t.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })
    return {
      kind: 'appointment_prep',
      title: `Get ready: ${soonAppt.title}`,
      detail: `Your appointment is at ${timeStr}${soonAppt.location ? ` — ${soonAppt.location}` : ''}.`,
      cta_label: 'View appointment',
      cta_href: '/appointments',
      why: 'It starts within the next 3 hours.',
    }
  }

  /* ---- 3. Medication dose whose time has passed, not yet taken ---- */
  const meds = ((medsRes.data ?? []) as MedRow[]).filter((m) => !m.as_needed)
  const takenIds = new Set(
    ((logsRes.data ?? []) as MedLogRow[])
      .filter((l) => l.status === 'taken')
      .map((l) => l.medication_id)
  )
  const dueMeds = meds
    .filter((m) => {
      const t = toMinutes(m.time)
      return t !== null && nowMin >= t && !takenIds.has(m.id)
    })
    .sort((a, b) => (toMinutes(a.time) ?? 0) - (toMinutes(b.time) ?? 0))
  if (dueMeds.length > 0) {
    const first = dueMeds[0]
    return {
      kind: 'medication',
      title:
        dueMeds.length === 1
          ? `Take your ${first.name}`
          : `Take your ${dueMeds.length} medications`,
      detail:
        dueMeds.length === 1
          ? `${first.dose ? `${first.dose} — ` : ''}scheduled for ${first.time}.`
          : dueMeds
              .map(
                (m) => `${m.name}${m.dose ? ` ${m.dose}` : ''} (${m.time})`
              )
              .join(', '),
      cta_label: 'Mark as taken',
      cta_href: '/medicine',
      why: 'This dose is scheduled for now.',
      medication_ids: dueMeds.map((m) => m.id),
    }
  }

  /* ---- 4. BP reading due inside its window, not yet recorded ---- */
  const life = lifeRes.data as {
    wake_time?: string | null
    bedtime?: string | null
  } | null

  const morningWindow = (): [number, number] => {
    const explicit = toMinutes(onboarding.bp_morning_time)
    if (explicit !== null) return [explicit, Math.min(explicit + 180, 1439)]
    const wake = toMinutes(life?.wake_time)
    if (wake !== null) return [wake + 30, Math.min(wake + 210, 1439)]
    return [7 * 60, 11 * 60]
  }
  const eveningWindow = (): [number, number] => {
    const explicit = toMinutes(onboarding.bp_evening_time)
    if (explicit !== null) return [explicit, Math.min(explicit + 180, 1439)]
    const bed = toMinutes(life?.bedtime)
    if (bed !== null)
      return [Math.max(bed - 240, 0), Math.max(bed - 60, 0)]
    return [18 * 60, 22 * 60]
  }

  const periods = new Set(readings.map((r) => r.period))
  const [mStart, mEnd] = morningWindow()
  if (nowMin >= mStart && nowMin <= mEnd && !periods.has('morning')) {
    return {
      kind: 'bp_morning',
      title: 'Take your morning blood pressure',
      detail: 'A morning reading helps you and your doctor see the trend.',
      cta_label: 'Log reading',
      cta_href: '/blood-pressure',
      why: 'Readings taken at the same time each day are the most useful.',
    }
  }
  const [eStart, eEnd] = eveningWindow()
  if (nowMin >= eStart && nowMin <= eEnd && !periods.has('evening')) {
    return {
      kind: 'bp_evening',
      title: 'Take your evening blood pressure',
      detail: 'An evening reading completes today\u2019s picture.',
      cta_label: 'Log reading',
      cta_href: '/blood-pressure',
      why: 'Readings taken at the same time each day are the most useful.',
    }
  }

  /* ---- 5. Craving support — only when a craving was actually recorded ---- */
  const cravingEvents = (habitsRes.data ?? []) as { id: string }[]
  if (cravingEvents.length > 0) {
    return {
      kind: 'craving_support',
      title: 'Ride out the craving',
      detail:
        'You logged a craving today. A short pause and a glass of water can help it pass.',
      cta_label: 'Get support',
      cta_href: '/habits',
      why: 'Cravings usually peak and fade within a few minutes.',
    }
  }

  /* ---- 6. Gentle activity — skipped on real pain/mobility barriers ---- */
  const contextState =
    (contextRes.data as { state?: string } | null)?.state ?? 'normal'
  const barrierHit = ((barriersRes.data ?? []) as { barrier: string }[]).some(
    (b) => /pain|mobilit|back|knee|hip|joint|injur|sore/i.test(b.barrier ?? '')
  )
  const metrics = metricsRes.data as {
    steps?: number | null
    walking_minutes?: number | null
  } | null
  const stepTarget = profileRes.data?.step_target ?? 6000
  const activeEnough =
    (metrics?.steps ?? 0) >= stepTarget ||
    (metrics?.walking_minutes ?? 0) >= 20
  if (
    contextState !== 'sick' &&
    contextState !== 'recovery_mode' &&
    !barrierHit &&
    !activeEnough
  ) {
    return {
      kind: 'activity',
      title: 'Take a short walk',
      detail:
        'A gentle 10-minute walk is a kind way to support healthy blood pressure.',
      cta_label: 'Start activity',
      cta_href: '/activity',
      why: 'Regular gentle movement supports healthy blood pressure.',
    }
  }

  /* ---- 7. Daily check-in ---- */
  const checkins = (stressRes.data ?? []) as { id: string }[]
  if (checkins.length === 0) {
    return {
      kind: 'check_in',
      title: 'How are you feeling?',
      detail:
        'A quick check-in takes seconds and helps spot patterns over time.',
      cta_label: 'Check in',
      cta_href: '/home',
      why: 'Mood and stress affect blood pressure.',
    }
  }

  /* ---- 8. Nothing due ---- */
  return {
    kind: 'caught_up',
    title: "You're caught up.",
    detail: 'Nothing needs your attention right now. Nice work.',
    cta_label: 'Talk to Health Guide',
    cta_href: '/guide',
  }
}
