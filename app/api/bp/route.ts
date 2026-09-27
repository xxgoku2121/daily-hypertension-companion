import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Db = Awaited<ReturnType<typeof createClient>>

const DEFAULT_SYSTOLIC_OVER = 180
const DEFAULT_DIASTOLIC_OVER = 120

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

async function requireUser(db: Db) {
  const {
    data: { user },
  } = await db.auth.getUser()
  return user
}

/** Strict whole-number parse. Rejects things like "12/8" or "120.5". */
function toInt(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : null
  }
  if (typeof value === 'string') {
    const t = value.trim()
    if (!/^-?\d+$/.test(t)) return null
    return parseInt(t, 10)
  }
  return null
}

function dayKey(iso: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso)
  return m ? m[1] : null
}

/** Hour (0-23) as the user experienced it, taken from the ISO local part. */
function localHour(iso: string): number {
  const m = /T(\d{2}):/.exec(iso)
  if (m) {
    const h = parseInt(m[1], 10)
    if (h >= 0 && h <= 23) return h
  }
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? new Date().getHours() : d.getHours()
}

export async function GET(req: NextRequest) {
  const db = await createClient()
  const user = await requireUser(db)
  if (!user) return err('Please sign in first.', 401)

  const { searchParams } = new URL(req.url)
  const rawLimit = parseInt(searchParams.get('limit') ?? '30', 10)
  const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 30 : rawLimit, 1), 100)
  const period = searchParams.get('period')

  let query = db
    .from('bp_readings')
    .select('*')
    .order('measured_at', { ascending: false })
    .limit(limit)
  if (period === 'morning' || period === 'evening') {
    query = query.eq('period', period)
  }

  const { data, error } = await query
  if (error) return err("We couldn't load your readings right now.", 500)
  return NextResponse.json({ readings: data ?? [] })
}

export async function POST(req: NextRequest) {
  const db = await createClient()
  const user = await requireUser(db)
  if (!user) return err('Please sign in first.', 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return err("We couldn't understand that request. Please try again.")
  }

  const systolic = toInt(body.systolic)
  const diastolic = toInt(body.diastolic)
  const pulse =
    body.pulse === undefined || body.pulse === null || body.pulse === ''
      ? null
      : toInt(body.pulse)

  if (systolic === null || diastolic === null) {
    return err(
      "That reading doesn't look right. Enter two whole numbers, like 120 over 80."
    )
  }
  if (systolic < 40 || systolic > 300) {
    return err('The top number (systolic) should be between 40 and 300.')
  }
  if (diastolic < 30 || diastolic > 200) {
    return err('The bottom number (diastolic) should be between 30 and 200.')
  }
  if (systolic <= diastolic) {
    return err(
      'The top number (systolic) should be higher than the bottom number (diastolic).'
    )
  }
  if (pulse !== null && (pulse < 30 || pulse > 250)) {
    return err('Pulse should be between 30 and 250, or left blank.')
  }

  let measuredAt: string
  if (typeof body.measured_at === 'string' && body.measured_at.trim() !== '') {
    const d = new Date(body.measured_at)
    if (Number.isNaN(d.getTime())) {
      return err("That date and time don't look right. Please check them.")
    }
    measuredAt = d.toISOString()
  } else {
    measuredAt = new Date().toISOString()
  }

  let period: 'morning' | 'evening'
  if (body.period === 'morning' || body.period === 'evening') {
    period = body.period
  } else {
    // life_profiles carries no BP schedule fields, so fall back to time of day.
    period = localHour(measuredAt) < 12 ? 'morning' : 'evening'
  }

  const source =
    typeof body.source === 'string' && body.source.trim() !== ''
      ? body.source.trim().slice(0, 80)
      : 'Manual entry'
  const notes =
    typeof body.notes === 'string' && body.notes.trim() !== ''
      ? body.notes.trim().slice(0, 500)
      : null
  const feeling =
    typeof body.feeling === 'string' && body.feeling.trim() !== ''
      ? body.feeling.trim().slice(0, 60)
      : null

  const date = dayKey(measuredAt) ?? measuredAt.slice(0, 10)
  const dedupKey = `${user.id}:${date}:${systolic}/${diastolic}:${pulse ?? 'na'}:${source}`

  const { data, error } = await db
    .from('bp_readings')
    .insert({
      user_id: user.id,
      systolic,
      diastolic,
      pulse,
      measured_at: measuredAt,
      period,
      source,
      dedup_key: dedupKey,
      notes,
      feeling,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      // Duplicate of an already-saved reading — return the original.
      const { data: existing } = await db
        .from('bp_readings')
        .select()
        .eq('user_id', user.id)
        .eq('dedup_key', dedupKey)
        .maybeSingle()
      return NextResponse.json(
        { reading: existing, duplicate: true, safety: false },
        { status: 200 }
      )
    }
    return err("We couldn't save that reading. Please try again.", 500)
  }

  // Safety check against the user's own thresholds (default 180/120).
  let systolicOver = DEFAULT_SYSTOLIC_OVER
  let diastolicOver = DEFAULT_DIASTOLIC_OVER
  const { data: rules } = await db
    .from('safety_rules')
    .select('systolic_over, diastolic_over')
    .eq('user_id', user.id)
    .maybeSingle()
  if (rules) {
    if (typeof rules.systolic_over === 'number') systolicOver = rules.systolic_over
    if (typeof rules.diastolic_over === 'number') diastolicOver = rules.diastolic_over
  }
  const safety = systolic > systolicOver || diastolic > diastolicOver

  if (safety) {
    // Best-effort audit trail; never fail the save because of it.
    await db.from('audit_events').insert({
      user_id: user.id,
      action: 'high_bp_reading',
      details: { reading_id: data.id, systolic, diastolic },
    })
  }

  return NextResponse.json({ reading: data, safety }, { status: 201 })
}
