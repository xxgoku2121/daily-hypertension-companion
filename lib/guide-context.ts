// Health Guide context builder.
//
// Permission-gated: reads ONLY the data areas listed in profile.guide_permissions
// (subset of blood_pressure, medication, food, activity, sleep, symptoms).
// NEVER reads a category the person has not permitted.
// The craving-history existence check is authorized by the product rule that
// craving support stays hidden unless a craving/nicotine event was recorded.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BpReading, Medication, MedicationLog } from './types'
import { zonedDayBounds, zonedDate } from './day'

export const GUIDE_PERMISSION_AREAS = [
  'blood_pressure',
  'medication',
  'food',
  'activity',
  'sleep',
  'symptoms',
] as const
export type GuidePermissionArea = (typeof GUIDE_PERMISSION_AREAS)[number]

export interface GuideSection {
  heading: 'PERSONAL' | 'PRESCRIPTION' | 'OBSERVED'
  body: string
}

export interface FoodItemSummary {
  meal_name: string
  meal_type: string | null
  sodium_mg: number | null
}

export interface StepDay {
  date: string
  steps: number
  walking_minutes: number
}

export interface SleepDay {
  date: string
  sleep_hours: number | null
}

export interface StressEntry {
  mood: string
  notes: string | null
  logged_at: string
}

export interface GuideContext {
  name: string | null
  age: number | null
  conditions: string[]
  permissions: GuidePermissionArea[]
  /** Labeled narrative sections for the chat system prompt. No evidence here. */
  sections: GuideSection[]
  /** Structured data for deterministic intent handling. */
  recentBp: BpReading[]
  activeMedications: Medication[]
  todayMedLogs: MedicationLog[]
  todayFood: FoodItemSummary[]
  /** Sum of KNOWN sodium only — nulls are never treated as 0. */
  todaySodiumMg: number
  /** Number of today's meals with unknown sodium (excluded from the total). */
  unknownSodiumCount: number
  sodiumTargetMg: number
  stepTarget: number
  recentSteps: StepDay[]
  recentSleep: SleepDay[]
  todayStress: StressEntry[]
  hasCravingHistory: boolean
  /** IANA timezone from profiles.timezone; null when unknown (UTC fallback). */
  timezone: string | null
}

function isArea(p: string): p is GuidePermissionArea {
  return (GUIDE_PERMISSION_AREAS as readonly string[]).includes(p)
}

function sevenDaysAgoISO(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function shortTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function prescriptionSourceLabel(source: Medication['instruction_source']): string {
  switch (source) {
    case 'prescription':
      return 'Your prescription says'
    case 'clinician':
      return 'Your clinician instructed'
    case 'pharmacist':
      return 'Your pharmacist advised'
    default:
      return 'You noted'
  }
}

export async function buildGuideContext(
  supabase: SupabaseClient,
  userId: string
): Promise<GuideContext> {
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('name, age, conditions, sodium_target, step_target, guide_permissions, timezone')
    .eq('id', userId)
    .maybeSingle()

  const profile = (profileRow ?? {}) as {
    name?: string | null
    age?: number | null
    conditions?: string[] | null
    sodium_target?: number | null
    step_target?: number | null
    guide_permissions?: string[] | null
    timezone?: string | null
  }

  const rawPerms = Array.isArray(profile.guide_permissions)
    ? profile.guide_permissions
    : [...GUIDE_PERMISSION_AREAS]
  const permissions = rawPerms.filter(isArea)
  const allowed = (area: GuidePermissionArea) => permissions.includes(area)

  const name = profile.name ?? null
  const age = typeof profile.age === 'number' ? profile.age : null
  const conditions = Array.isArray(profile.conditions) ? profile.conditions : []
  const sodiumTargetMg = typeof profile.sodium_target === 'number' ? profile.sodium_target : 2000
  const stepTarget = typeof profile.step_target === 'number' ? profile.step_target : 6000

  const sections: GuideSection[] = []
  const observed: string[] = []

  // ---- personal identity (always allowed: it is the person's own profile) ----
  const personalBits: string[] = []
  if (name) personalBits.push(`Name: ${name}`)
  if (age !== null) personalBits.push(`Age: ${age}`)
  if (conditions.length > 0) personalBits.push(`Known conditions: ${conditions.join(', ')}`)
  if (personalBits.length > 0) {
    sections.push({ heading: 'PERSONAL', body: personalBits.join('. ') + '.' })
  }

  const sevenDaysAgo = sevenDaysAgoISO()
  // "Today" follows the person's own timezone, not the server's clock.
  const timezone = typeof profile.timezone === 'string' && profile.timezone ? profile.timezone : null
  const todayStart = zonedDayBounds(timezone).startIso
  const sevenDaysAgoDate = zonedDate(timezone, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))

  // ---- blood pressure (7 days) ----
  let recentBp: BpReading[] = []
  if (allowed('blood_pressure')) {
    const { data } = await supabase
      .from('bp_readings')
      .select('*')
      .eq('user_id', userId)
      .gte('measured_at', sevenDaysAgo)
      .order('measured_at', { ascending: false })
    recentBp = ((data ?? []) as BpReading[]).slice(0, 30)
    if (recentBp.length === 0) {
      observed.push('No blood pressure readings recorded in the last 7 days.')
    } else {
      const latest = recentBp[0]
      observed.push(
        `${recentBp.length} blood pressure reading(s) in the last 7 days. ` +
          `Latest: ${latest.systolic}/${latest.diastolic} on ${shortDate(latest.measured_at)} (${latest.period}).`
      )
    }
  }

  // ---- medications + today's logs ----
  let activeMedications: Medication[] = []
  let todayMedLogs: MedicationLog[] = []
  if (allowed('medication')) {
    const [{ data: meds }, { data: logs }] = await Promise.all([
      supabase
        .from('medications')
        .select('*')
        .eq('user_id', userId)
        .eq('active', true)
        .order('time', { ascending: true }),
      supabase
        .from('medication_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('logged_at', todayStart)
        .order('logged_at', { ascending: false }),
    ])
    activeMedications = (meds ?? []) as Medication[]
    todayMedLogs = (logs ?? []) as MedicationLog[]

    const prescriptionLines: string[] = []
    for (const med of activeMedications) {
      const label = `${med.name}${med.dose ? ` ${med.dose}` : ''}`
      if (med.instructions && med.instruction_source !== 'user') {
        prescriptionLines.push(
          `${label} (${med.frequency ?? 'Daily'} at ${med.time ?? 'unscheduled'}): ` +
            `${prescriptionSourceLabel(med.instruction_source)}: "${med.instructions}"`
        )
      }
      const todays = todayMedLogs.filter((l) => l.medication_id === med.id)
      const takenCount = todays.filter((l) => l.status === 'taken').length
      const latestTaken = todays
        .filter((l) => l.status === 'taken')
        .sort((a, b) => (b.logged_at ?? '').localeCompare(a.logged_at ?? ''))[0]
      observed.push(
        takenCount > 0
          ? `${label}: marked taken ${takenCount > 1 ? `${takenCount} times ` : ''}today${latestTaken ? ` (latest ${shortTime(latestTaken.logged_at)})` : ''}.`
          : `${label}: not yet marked taken today (scheduled ${med.time ?? 'unscheduled'}).`
      )
    }
    if (prescriptionLines.length > 0) {
      sections.push({ heading: 'PRESCRIPTION', body: prescriptionLines.join('\n') })
    }
    // user-noted instructions belong to PERSONAL, not PRESCRIPTION
    const userNoted = activeMedications.filter(
      (m) => m.instructions && m.instruction_source === 'user'
    )
    if (userNoted.length > 0) {
      sections.push({
        heading: 'PERSONAL',
        body:
          'Medication notes the person wrote themselves: ' +
          userNoted
            .map((m) => `${m.name}: "${m.instructions}"`)
            .join('; '),
      })
    }
    if (activeMedications.length === 0) {
      observed.push('No active medications on file.')
    }
  }

  // ---- food (today) ----
  let todayFood: FoodItemSummary[] = []
  let todaySodiumMg = 0
  let unknownSodiumCount = 0
  if (allowed('food')) {
    const { data } = await supabase
      .from('food_records')
      .select('meal_name, meal_type, sodium_mg')
      .eq('user_id', userId)
      .gte('logged_at', todayStart)
      .order('logged_at', { ascending: true })
    todayFood = (data ?? []) as FoodItemSummary[]
    // UNKNOWN IS NOT YES: meals with unknown sodium are reported as unknown
    // and excluded from the total — never silently counted as 0.
    const known = todayFood.filter((f) => f.sodium_mg != null)
    unknownSodiumCount = todayFood.length - known.length
    todaySodiumMg = known.reduce((sum, f) => sum + (f.sodium_mg || 0), 0)
    if (todayFood.length === 0) {
      observed.push('No meals logged today.')
    } else {
      const mealBits = todayFood.map((f) =>
        f.sodium_mg != null ? `${f.meal_name} (${f.sodium_mg} mg sodium)` : `${f.meal_name} (sodium unknown)`
      )
      observed.push(
        `Today's meals: ${mealBits.join(', ')}. ` +
          `Total sodium so far today: ${todaySodiumMg} mg of a ${sodiumTargetMg} mg daily target` +
          (unknownSodiumCount > 0
            ? ` (${unknownSodiumCount} meal${unknownSodiumCount === 1 ? '' : 's'} with unknown sodium not counted).`
            : '.')
      )
    }
  }

  // ---- activity + sleep (7 days, from daily_metrics) ----
  let recentSteps: StepDay[] = []
  let recentSleep: SleepDay[] = []
  if (allowed('activity') || allowed('sleep')) {
    const { data } = await supabase
      .from('daily_metrics')
      .select('date, steps, walking_minutes, sleep_hours')
      .eq('user_id', userId)
      .gte('date', sevenDaysAgoDate)
      .order('date', { ascending: false })
    const rows = (data ?? []) as {
      date: string
      steps: number | null
      walking_minutes: number | null
      sleep_hours: number | null
    }[]
    if (allowed('activity')) {
      recentSteps = rows.map((r) => ({
        date: r.date,
        steps: r.steps ?? 0,
        walking_minutes: r.walking_minutes ?? 0,
      }))
      const withSteps = recentSteps.filter((r) => r.steps > 0)
      if (withSteps.length === 0) {
        observed.push('No step counts recorded in the last 7 days.')
      } else {
        const avg = Math.round(
          withSteps.reduce((s, r) => s + r.steps, 0) / withSteps.length
        )
        observed.push(
          `Steps recorded on ${withSteps.length} of the last 7 days (average ${avg} steps on days with data; daily target ${stepTarget}).`
        )
      }
    }
    if (allowed('sleep')) {
      recentSleep = rows
        .filter((r) => r.sleep_hours !== null && r.sleep_hours !== undefined)
        .map((r) => ({ date: r.date, sleep_hours: r.sleep_hours }))
      if (recentSleep.length === 0) {
        observed.push('No sleep hours recorded in the last 7 days.')
      } else {
        const latest = recentSleep[0]
        observed.push(
          `Most recent sleep: ${latest.sleep_hours} hours on ${shortDate(latest.date + 'T12:00:00')}.`
        )
      }
    }
  }

  // ---- symptoms -> today's stress/check-in logs ----
  let todayStress: StressEntry[] = []
  if (allowed('symptoms')) {
    const { data } = await supabase
      .from('stress_logs')
      .select('mood, notes, logged_at')
      .eq('user_id', userId)
      .gte('logged_at', todayStart)
      .order('logged_at', { ascending: false })
    todayStress = (data ?? []) as StressEntry[]
    if (todayStress.length > 0) {
      const latest = todayStress[0]
      observed.push(
        `Today's check-in: feeling "${latest.mood}"${latest.notes ? ` — note: "${latest.notes}"` : ''}.`
      )
    }
  }

  if (observed.length > 0) {
    sections.push({ heading: 'OBSERVED', body: observed.join('\n') })
  }

  // ---- craving history: existence check only (drives chip visibility) ----
  let hasCravingHistory = false
  {
    const { data } = await supabase
      .from('habit_records')
      .select('id')
      .eq('user_id', userId)
      .in('kind', ['craving_event', 'smoking_event'])
      .limit(1)
    hasCravingHistory = ((data ?? []) as { id: string }[]).length > 0
  }

  return {
    name,
    age,
    conditions,
    permissions,
    sections,
    recentBp,
    activeMedications,
    todayMedLogs,
    todayFood,
    todaySodiumMg,
    unknownSodiumCount,
    sodiumTargetMg,
    stepTarget,
    recentSteps,
    recentSleep,
    todayStress,
    hasCravingHistory,
    timezone,
  }
}
