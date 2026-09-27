// Health Guide action confirmations.
// POST { action_id, confirmed } — executes a PENDING ai_actions row only after
// the person confirms. Unknown, already-handled, or expired actions are
// rejected with plain-language messages. Every write is scoped to the user.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ACTION_EXPIRY_MS = 24 * 60 * 60 * 1000

async function getAuthed() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, user }
}

type Authed = NonNullable<Awaited<ReturnType<typeof getAuthed>>>

interface AiActionRow {
  id: string
  user_id: string
  action_type: string
  requested_params: Record<string, unknown> | null
  confirmation_status: string
  created_at: string
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

async function executeAction(
  supabase: Authed['supabase'],
  userId: string,
  action: AiActionRow
): Promise<{ message: string; detail?: Record<string, unknown> }> {
  const params = asRecord(action.requested_params)

  switch (action.action_type) {
    case 'mark_medication_taken': {
      const medicationId = asString(params.medication_id)
      if (!medicationId) throw new Error('missing medication_id')
      const { data: med } = await supabase
        .from('medications')
        .select('id, name, dose')
        .eq('id', medicationId)
        .eq('user_id', userId)
        .eq('active', true)
        .maybeSingle()
      const medRow = med as { id: string; name: string; dose: string | null } | null
      if (!medRow) throw new Error('medication not found')
      const { error } = await supabase.from('medication_logs').insert({
        user_id: userId,
        medication_id: medRow.id,
        status: 'taken',
        logged_at: new Date().toISOString(),
      })
      if (error) throw error
      const label = `${medRow.name}${medRow.dose ? ` ${medRow.dose}` : ''}`
      return { message: `Done — ${label} marked as taken.`, detail: { medication_id: medRow.id } }
    }

    case 'log_bp': {
      const systolic = asNumber(params.systolic)
      const diastolic = asNumber(params.diastolic)
      const period = asString(params.period) === 'evening' ? 'evening' : 'morning'
      const pulse = asNumber(params.pulse)
      if (
        systolic === null ||
        diastolic === null ||
        systolic < 40 ||
        systolic > 300 ||
        diastolic < 30 ||
        diastolic > 200
      ) {
        throw new Error('invalid bp values')
      }
      const { error } = await supabase.from('bp_readings').insert({
        user_id: userId,
        systolic: Math.round(systolic),
        diastolic: Math.round(diastolic),
        pulse: pulse === null ? null : Math.round(pulse),
        measured_at: new Date().toISOString(),
        period,
        source: 'Health Guide',
        verified: true,
      })
      if (error) throw error
      return {
        message: `Saved: ${Math.round(systolic)}/${Math.round(diastolic)} as your ${period} reading.`,
      }
    }

    case 'create_reminder': {
      const label = asString(params.label)
      if (!label) throw new Error('missing label')
      const recurring = params.recurring === true
      if (recurring) {
        const { error } = await supabase.from('automation_rules').insert({
          user_id: userId,
          name: label.slice(0, 120),
          trigger_desc: 'Daily reminder from Health Guide',
          action_desc: label.slice(0, 300),
          active: true,
          created_from: 'ai',
        })
        if (error) throw error
      } else {
        const today = new Date().toISOString().slice(0, 10)
        const { error } = await supabase.from('daily_tasks').insert({
          user_id: userId,
          date: today,
          kind: 'reminder',
          label: label.slice(0, 200),
          completed: false,
        })
        if (error) throw error
      }
      return { message: `Reminder set: ${label}.` }
    }

    case 'add_doctor_question': {
      const question = asString(params.question)
      if (!question) throw new Error('missing question')
      const { error } = await supabase.from('doctor_questions').insert({
        user_id: userId,
        question: question.slice(0, 500),
        source: 'ai_suggested',
        status: 'kept',
      })
      if (error) throw error
      return { message: 'Saved to your doctor questions.' }
    }

    case 'start_craving_support': {
      const note = asString(params.note)
      const { error } = await supabase.from('habit_records').insert({
        user_id: userId,
        kind: 'craving_event',
        notes: note ? note.slice(0, 300) : null,
        logged_at: new Date().toISOString(),
      })
      if (error) throw error
      return {
        message:
          'Logged. Every craving you ride out makes the next one easier — well done reaching out instead of giving in.',
      }
    }

    default:
      throw new Error(`unknown action type: ${action.action_type}`)
  }
}

export async function POST(request: Request) {
  const authed = await getAuthed()
  if (!authed) {
    return NextResponse.json(
      { error: 'Please sign in to use the Health Guide.' },
      { status: 401 }
    )
  }
  const { supabase, user } = authed

  let body: { action_id?: unknown; confirmed?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'I could not read that confirmation. Please try again.' },
      { status: 400 }
    )
  }

  const actionId = asString(body.action_id)
  if (!actionId || typeof body.confirmed !== 'boolean') {
    return NextResponse.json(
      { error: 'That confirmation was missing details. Please try again.' },
      { status: 400 }
    )
  }
  const confirmed = body.confirmed

  try {
    const { data } = await supabase
      .from('ai_actions')
      .select('id, user_id, action_type, requested_params, confirmation_status, created_at')
      .eq('id', actionId)
      .eq('user_id', user.id)
      .maybeSingle()
    const action = data as AiActionRow | null

    if (!action) {
      return NextResponse.json(
        { error: "I couldn't find that action. It may have expired — please ask me again." },
        { status: 404 }
      )
    }
    if (action.confirmation_status !== 'pending') {
      return NextResponse.json(
        { error: 'This was already handled — nothing more to do.' },
        { status: 400 }
      )
    }
    if (Date.now() - new Date(action.created_at).getTime() > ACTION_EXPIRY_MS) {
      await supabase
        .from('ai_actions')
        .update({ confirmation_status: 'cancelled' })
        .eq('id', action.id)
      return NextResponse.json(
        { error: 'That confirmation expired. Please ask me again and I’ll prepare it fresh.' },
        { status: 410 }
      )
    }

    if (!confirmed) {
      await supabase
        .from('ai_actions')
        .update({ confirmation_status: 'cancelled' })
        .eq('id', action.id)
      return NextResponse.json({
        ok: true,
        status: 'cancelled',
        message: 'No problem — I cancelled it. Nothing was changed.',
      })
    }

    try {
      const result = await executeAction(supabase, user.id, action)
      await supabase
        .from('ai_actions')
        .update({ confirmation_status: 'executed', execution_result: result.detail ?? {} })
        .eq('id', action.id)
      return NextResponse.json({ ok: true, status: 'executed', message: result.message })
    } catch (execError) {
      await supabase
        .from('ai_actions')
        .update({
          confirmation_status: 'failed',
          execution_result: {
            error: execError instanceof Error ? execError.message : 'unknown',
          },
        })
        .eq('id', action.id)
      return NextResponse.json(
        { error: 'Something went wrong saving that. Please try again in a moment.' },
        { status: 500 }
      )
    }
  } catch {
    return NextResponse.json(
      { error: 'Something went wrong on my side. Please try again in a moment.' },
      { status: 500 }
    )
  }
}
