import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Db = Awaited<ReturnType<typeof createClient>>

const STATUSES = ['taken', 'skipped', 'snoozed', 'not_taken'] as const

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

async function requireUser(db: Db) {
  const {
    data: { user },
  } = await db.auth.getUser()
  return user
}

function toLocalDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T12:00:00Z`)
  return !Number.isNaN(d.getTime())
}

/**
 * Local-day window in UTC. The client sends its getTimezoneOffset() so
 * "today" means the user's today, not the server's.
 */
function dayWindow(date: string, tzOffsetMinutes: number): { start: string; end: string } {
  const startUtc = Date.parse(`${date}T00:00:00Z`) + tzOffsetMinutes * 60_000
  const endUtc = startUtc + 24 * 60 * 60_000
  return { start: new Date(startUtc).toISOString(), end: new Date(endUtc).toISOString() }
}

function parseTzOffset(value: string | null): number {
  const n = parseInt(value ?? '', 10)
  return Number.isNaN(n) ? 0 : Math.min(Math.max(n, -840), 840)
}

export async function GET(req: NextRequest) {
  const db = await createClient()
  const user = await requireUser(db)
  if (!user) return err('Please sign in first.', 401)

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? toLocalDate()
  if (!isValidDate(date)) return err("That date doesn't look right.")
  const { start, end } = dayWindow(date, parseTzOffset(searchParams.get('tz_offset')))

  const { data, error } = await db
    .from('medication_logs')
    .select('*')
    .eq('user_id', user.id)
    .gte('logged_at', start)
    .lt('logged_at', end)
    .order('logged_at', { ascending: true })
  if (error) return err("We couldn't load today's medicine log right now.", 500)
  return NextResponse.json({ logs: data ?? [], date })
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

  const medicationId = typeof body.medication_id === 'string' ? body.medication_id : ''
  if (!medicationId) return err('No medicine was specified.')

  if (typeof body.status !== 'string' || !(STATUSES as readonly string[]).includes(body.status)) {
    return err("That status doesn't look right.")
  }
  const status = body.status as (typeof STATUSES)[number]

  // Confirm the medicine belongs to this user.
  const { data: med } = await db
    .from('medications')
    .select('id')
    .eq('id', medicationId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!med) return err("We couldn't find that medicine.", 404)

  const date =
    typeof body.date === 'string' && isValidDate(body.date) ? body.date : toLocalDate()
  const tzOffset =
    typeof body.tz_offset === 'number' && Number.isFinite(body.tz_offset)
      ? body.tz_offset
      : 0
  const { start, end } = dayWindow(date, tzOffset)

  let scheduledFor: string | null = null
  if (typeof body.scheduled_for === 'string' && body.scheduled_for.trim() !== '') {
    const d = new Date(body.scheduled_for)
    if (Number.isNaN(d.getTime())) return err("That scheduled time doesn't look right.")
    scheduledFor = d.toISOString()
  }

  const notes =
    typeof body.notes === 'string' && body.notes.trim() !== ''
      ? body.notes.trim().slice(0, 500)
      : null

  // A "taken" tap is a dose event: always a new row, so twice- or
  // three-times-daily medicines can record every dose. Deferral states
  // ("snoozed", "skipped", "not_taken") describe today's outstanding dose:
  // refresh the latest non-taken row when one exists, otherwise insert.
  // Taken rows are never overwritten by a deferral.
  if (status === 'taken') {
    const { data, error } = await db
      .from('medication_logs')
      .insert({
        user_id: user.id,
        medication_id: medicationId,
        status,
        scheduled_for: scheduledFor,
        notes,
      })
      .select()
      .single()
    if (error) return err("We couldn't save that. Please try again.", 500)
    return NextResponse.json({ log: data, updated: false }, { status: 201 })
  }

  const { data: existing } = await db
    .from('medication_logs')
    .select('id')
    .eq('user_id', user.id)
    .eq('medication_id', medicationId)
    .neq('status', 'taken')
    .gte('logged_at', start)
    .lt('logged_at', end)
    .order('logged_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    const { data, error } = await db
      .from('medication_logs')
      .update({
        status,
        logged_at: new Date().toISOString(),
        scheduled_for: scheduledFor,
        notes,
      })
      .eq('id', existing.id)
      .eq('user_id', user.id)
      .select()
      .single()
    if (error) return err("We couldn't save that. Please try again.", 500)
    return NextResponse.json({ log: data, updated: true })
  }

  const { data, error } = await db
    .from('medication_logs')
    .insert({
      user_id: user.id,
      medication_id: medicationId,
      status,
      scheduled_for: scheduledFor,
      notes,
    })
    .select()
    .single()
  if (error) return err("We couldn't save that. Please try again.", 500)
  return NextResponse.json({ log: data, updated: false }, { status: 201 })
}
