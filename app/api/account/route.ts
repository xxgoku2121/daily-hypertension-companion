import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const USER_TABLES = [
  'bp_readings',
  'medications',
  'medication_logs',
  'food_records',
  'daily_metrics',
  'weight_records',
  'hydration_logs',
  'stress_logs',
  'habit_records',
  'user_strategies',
  'barriers',
  'ai_messages',
  'ai_actions',
  'appointments',
  'schedule_events',
  'daily_tasks',
  'automation_rules',
  'automation_activity',
  'notifications',
  'job_executions',
  'health_reports',
  'doctor_questions',
  'device_connections',
  'care_team',
  'caregiver_permissions',
  'caregiver_audit',
  'emergency_contacts',
  'health_goals',
  'life_profiles',
  'daily_contexts',
  'safety_rules',
  'audit_events',
]

async function wipeUserData(supabase: Awaited<ReturnType<typeof createClient>>, user_id: string) {
  for (const t of USER_TABLES) {
    const { error } = await supabase.from(t).delete().eq('user_id', user_id)
    if (error) throw new Error(`Could not clear ${t}.`)
  }
}

// POST {action: 'fresh_start'} — deletes all health data rows but keeps the
// account and the profile (settings).
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (body.action !== 'fresh_start')
    return NextResponse.json({ error: 'That could not be done.' }, { status: 400 })

  try {
    await wipeUserData(supabase, user.id)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not start fresh.' },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true })
}

// DELETE — deletes ALL user rows including the profile, then signs the user out.
// NOTE (honest limitation): removing the login identity itself (auth.users)
// requires the Supabase service role, which this app does not hold. After this
// call the account holds no data; the sign-in itself can be removed by support.
export async function DELETE() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  try {
    await wipeUserData(supabase, user.id)
    const { error } = await supabase.from('profiles').delete().eq('id', user.id)
    if (error) throw new Error('Could not delete your profile.')
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not delete your account.' },
      { status: 500 }
    )
  }

  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
