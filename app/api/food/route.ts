import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function authed() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

// GET ?date=YYYY-MM-DD -> { meals, total_sodium }
export async function GET(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const date = new URL(req.url).searchParams.get('date') || today()
  const { data, error } = await supabase
    .from('food_records')
    .select('*')
    .eq('user_id', user.id)
    .gte('logged_at', `${date}T00:00:00`)
    .lt('logged_at', `${date}T23:59:59.999`)
    .order('logged_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Could not load meals.' }, { status: 500 })

  const total_sodium = (data ?? []).reduce((s, m) => s + (m.sodium_mg || 0), 0)
  return NextResponse.json({ meals: data ?? [], total_sodium, date })
}

// POST {meal_name, meal_type?, portion?, sodium_mg?, notes?}
export async function POST(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { meal_name, meal_type, portion, sodium_mg, notes } = body
  if (!meal_name || !String(meal_name).trim())
    return NextResponse.json({ error: 'Please name the meal or food.' }, { status: 400 })

  const { data, error } = await supabase
    .from('food_records')
    .insert({
      user_id: user.id,
      meal_name: String(meal_name).trim(),
      meal_type: meal_type || null,
      portion: portion || null,
      sodium_mg: Math.max(0, Math.round(Number(sodium_mg) || 0)),
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
