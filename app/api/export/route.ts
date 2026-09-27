import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Tables holding user-owned data (profiles kept only in JSON snapshot; deleted separately).
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

function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}

// GET ?format=json|csv
//   json -> full user snapshot as a download (all tables)
//   csv  -> blood-pressure readings as a CSV download
export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const format = new URL(req.url).searchParams.get('format') || 'json'

  if (format === 'csv') {
    const { data, error } = await supabase
      .from('bp_readings')
      .select('systolic,diastolic,pulse,measured_at,period,source,notes,feeling')
      .eq('user_id', user.id)
      .order('measured_at', { ascending: true })
    if (error) return NextResponse.json({ error: 'Could not export your readings.' }, { status: 500 })

    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = ['systolic,diastolic,pulse,measured_at,period,source,notes,feeling']
    for (const r of data ?? [])
      lines.push(
        [r.systolic, r.diastolic, r.pulse, r.measured_at, r.period, r.source, r.notes, r.feeling]
          .map(cell)
          .join(',')
      )
    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="bp-readings-${todayStamp()}.csv"`,
      },
    })
  }

  // JSON: full snapshot
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  const tables: Record<string, unknown> = { profile }
  const results = await Promise.all(
    USER_TABLES.map((t) => supabase.from(t).select('*').eq('user_id', user.id))
  )
  results.forEach((r, i) => {
    tables[USER_TABLES[i]] = r.error ? [] : (r.data ?? [])
  })

  return new NextResponse(
    JSON.stringify(
      { exported_at: new Date().toISOString(), user_id: user.id, tables },
      null,
      2
    ),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="health-companion-data-${todayStamp()}.json"`,
      },
    }
  )
}
