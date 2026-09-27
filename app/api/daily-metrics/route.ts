import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function authed() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

// GET ?date=YYYY-MM-DD (default today) or ?days=N for recent rows
export async function GET(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const days = Math.min(30, Math.max(1, Number(params.get('days')) || 1))

  const { data, error } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(days)
  if (error) return NextResponse.json({ error: 'Could not load daily records.' }, { status: 500 })
  return NextResponse.json({ metrics: data ?? [] })
}

// PATCH {date, steps?, walking_minutes?, sleep_hours?, bedtime?, wake_time?}
// Upserts the day's row; merges numbers (walking_minutes adds, others overwrite).
export async function PATCH(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const date: string = body.date || new Date().toISOString().slice(0, 10)

  const { data: existing } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle()

  const row: Record<string, unknown> = { user_id: user.id, date }
  if (body.steps !== undefined) row.steps = Math.max(0, Math.round(Number(body.steps) || 0))
  if (body.walking_minutes !== undefined)
    row.walking_minutes =
      (existing?.walking_minutes || 0) + Math.max(0, Math.round(Number(body.walking_minutes) || 0))
  if (body.sleep_hours !== undefined) row.sleep_hours = Number(body.sleep_hours) || null
  if (body.bedtime !== undefined) row.bedtime = body.bedtime || null
  if (body.wake_time !== undefined) row.wake_time = body.wake_time || null

  const { data, error } = await supabase
    .from('daily_metrics')
    .upsert(row, { onConflict: 'user_id,date' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
  return NextResponse.json({ metrics: data })
}
