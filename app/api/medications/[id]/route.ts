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

// Medications are never hard-deleted: PATCH with active=false archives.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await createClient()
  const user = await requireUser(db)
  if (!user) return err('Please sign in first.', 401)

  const { id } = await params
  if (!id) return err('No medicine was specified.')

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return err("We couldn't understand that request. Please try again.")
  }

  const updates: Record<string, unknown> = {}

  if ('name' in body) {
    const name = cleanString(body.name, 120)
    if (!name) return err('Please give the medicine a name.')
    updates.name = name
  }
  if ('dose' in body) updates.dose = cleanString(body.dose, 60)
  if ('frequency' in body) updates.frequency = cleanString(body.frequency, 40) ?? 'Daily'
  if ('time' in body) {
    if (typeof body.time === 'string' && /^\d{2}:\d{2}$/.test(body.time.trim())) {
      updates.time = body.time.trim()
    } else {
      return err("That time doesn't look right. Use a time like 08:00.")
    }
  }
  if ('instructions' in body) updates.instructions = cleanString(body.instructions, 1000)
  if ('instruction_source' in body) {
    if (
      typeof body.instruction_source === 'string' &&
      (INSTRUCTION_SOURCES as readonly string[]).includes(body.instruction_source)
    ) {
      updates.instruction_source = body.instruction_source
    } else {
      return err("That instruction source doesn't look right.")
    }
  }
  if ('prescriber' in body) updates.prescriber = cleanString(body.prescriber, 120)
  if ('pharmacy' in body) updates.pharmacy = cleanString(body.pharmacy, 120)
  if ('pharmacy_phone' in body) updates.pharmacy_phone = cleanString(body.pharmacy_phone, 40)
  if ('refill_date' in body) {
    if (typeof body.refill_date === 'string' && body.refill_date.trim() !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.refill_date.trim())) {
        return err("That refill date doesn't look right. Please pick a calendar date.")
      }
      updates.refill_date = body.refill_date.trim()
    } else {
      updates.refill_date = null
    }
  }
  if ('refills_remaining' in body) {
    const v = body.refills_remaining
    if (v === null || v === '') {
      updates.refills_remaining = null
    } else if (
      (typeof v === 'number' && Number.isInteger(v)) ||
      (typeof v === 'string' && /^-?\d+$/.test(v.trim()))
    ) {
      updates.refills_remaining = Math.max(0, parseInt(String(v).trim(), 10))
    } else {
      return err('Refills remaining should be a whole number, or left blank.')
    }
  }
  if ('as_needed' in body) updates.as_needed = body.as_needed === true
  if ('active' in body) {
    const active = body.active === true
    updates.active = active
    updates.archived_at = active ? null : new Date().toISOString()
  }

  if (Object.keys(updates).length === 0) {
    return err('Nothing to update.')
  }

  const { data, error } = await db
    .from('medications')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .maybeSingle()

  if (error) return err("We couldn't update that medicine. Please try again.", 500)
  if (!data) return err("We couldn't find that medicine.", 404)
  return NextResponse.json({ medication: data })
}
