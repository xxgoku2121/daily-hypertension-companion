import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Db = Awaited<ReturnType<typeof createClient>>

const INSTRUCTION_SOURCES = ['prescription', 'clinician', 'pharmacist', 'user'] as const

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

async function requireUser(db: Db) {
  const {
    data: { user },
  } = await db.auth.getUser()
  return user
}

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t === '' ? null : t.slice(0, max)
}

/** Returns { ok, value } — ok:false means the input was present but not a whole number. */
function parseOptionalInt(value: unknown): { ok: boolean; value: number | null } {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null }
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return { ok: true, value }
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return { ok: true, value: parseInt(value.trim(), 10) }
  }
  return { ok: false, value: null }
}

export async function GET() {
  const db = await createClient()
  const user = await requireUser(db)
  if (!user) return err('Please sign in first.', 401)

  const { data, error } = await db
    .from('medications')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('time', { ascending: true })
  if (error) return err("We couldn't load your medicines right now.", 500)
  return NextResponse.json({ medications: data ?? [] })
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

  const name = cleanString(body.name, 120)
  if (!name) return err('Please give the medicine a name.')

  const instructionSource =
    typeof body.instruction_source === 'string' &&
    (INSTRUCTION_SOURCES as readonly string[]).includes(body.instruction_source)
      ? body.instruction_source
      : 'user'

  const time =
    typeof body.time === 'string' && /^\d{2}:\d{2}$/.test(body.time.trim())
      ? body.time.trim()
      : '08:00'

  const refillsParsed = parseOptionalInt(body.refills_remaining)
  if (!refillsParsed.ok) {
    return err('Refills remaining should be a whole number, or left blank.')
  }
  const refills = refillsParsed.value === null ? null : Math.max(0, refillsParsed.value)

  let refillDate: string | null = null
  if (typeof body.refill_date === 'string' && body.refill_date.trim() !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.refill_date.trim())) {
      return err("That refill date doesn't look right. Please pick a calendar date.")
    }
    refillDate = body.refill_date.trim()
  }

  const { data, error } = await db
    .from('medications')
    .insert({
      user_id: user.id,
      name,
      dose: cleanString(body.dose, 60),
      frequency:
        cleanString(body.frequency, 40) ?? 'Daily',
      time,
      instructions: cleanString(body.instructions, 1000),
      instruction_source: instructionSource,
      prescriber: cleanString(body.prescriber, 120),
      pharmacy: cleanString(body.pharmacy, 120),
      pharmacy_phone: cleanString(body.pharmacy_phone, 40),
      refill_date: refillDate,
      refills_remaining: refills,
      as_needed: body.as_needed === true,
    })
    .select()
    .single()

  if (error) return err("We couldn't save that medicine. Please try again.", 500)
  return NextResponse.json({ medication: data }, { status: 201 })
}
