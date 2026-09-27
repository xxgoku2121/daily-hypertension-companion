import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { zonedDayBounds, zonedDayBoundsForDate } from '@/lib/day'

async function authed() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

// GET ?date=YYYY-MM-DD -> { meals, total_sodium }
// "Today" (and any ?date=) is interpreted in the person's own timezone —
// the server's UTC day would show the wrong meals every evening.
export async function GET(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { data: prof } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .maybeSingle()
  const tz = (prof as { timezone?: string | null } | null)?.timezone ?? null

  const param = new URL(req.url).searchParams.get('date')
  const bounds =
    (param ? zonedDayBoundsForDate(tz, param) : null) ?? zonedDayBounds(tz)
  const { date, startIso, endIso } = bounds

  const { data, error } = await supabase
    .from('food_records')
    .select('*')
    .eq('user_id', user.id)
    .gte('logged_at', startIso)
    .lte('logged_at', endIso)
    .order('logged_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Could not load meals.' }, { status: 500 })

  const total_sodium = (data ?? []).reduce(
    (s, m) => s + (typeof m.sodium_mg === 'number' ? m.sodium_mg : 0),
    0
  )
  const unknown_sodium = (data ?? []).filter((m) => m.sodium_mg == null).length
  return NextResponse.json({ meals: data ?? [], total_sodium, unknown_sodium, date })
}

// POST {meal_name, meal_type?, portion?, sodium_mg?, notes?}
export async function POST(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { meal_name, meal_type, portion, sodium_mg, notes } = body
  if (!meal_name || !String(meal_name).trim())
    return NextResponse.json({ error: 'Please name the meal or food.' }, { status: 400 })

  // Sodium is honest-unknown unless a real number is given — never a silent 0.
  const sodiumRaw = sodium_mg === '' || sodium_mg == null ? null : Number(sodium_mg)
  const sodium =
    sodiumRaw == null || Number.isNaN(sodiumRaw) ? null : Math.max(0, Math.round(sodiumRaw))

  const { data, error } = await supabase
    .from('food_records')
    .insert({
      user_id: user.id,
      meal_name: String(meal_name).trim(),
      meal_type: meal_type || null,
      portion: portion || null,
      sodium_mg: sodium,
      notes: notes || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Could not save the meal.' }, { status: 500 })
  return NextResponse.json({ meal: data }, { status: 201 })
}

// DELETE ?id=
export async function DELETE(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'That could not be removed.' }, { status: 400 })

  const { error } = await supabase.from('food_records').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Could not remove the meal.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
