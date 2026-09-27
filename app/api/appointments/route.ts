import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function authed() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

// GET -> { appointments } (newest first; client splits upcoming/past)
export async function GET() {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', user.id)
    .order('date_time', { ascending: false })
  if (error) return NextResponse.json({ error: 'Could not load appointments.' }, { status: 500 })
  return NextResponse.json({ appointments: data })
}

// POST {title, date_time, location?, doctor?, notes?, transport_needed?}
export async function POST(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { title, date_time, location, doctor, notes, transport_needed } = body
  if (!title || !date_time)
    return NextResponse.json(
      { error: 'Please give the appointment a title and a date and time.' },
      { status: 400 }
    )

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      user_id: user.id,
      title: String(title),
      date_time,
      location: location || null,
      doctor: doctor || null,
      notes: notes || null,
      transport_needed: !!transport_needed,
      status: 'upcoming',
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Could not save the appointment.' }, { status: 500 })
  return NextResponse.json({ appointment: data }, { status: 201 })
}

// PATCH {id, status} — status in upcoming|done|cancelled
export async function PATCH(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { id, status } = body
  if (!id || !['upcoming', 'done', 'cancelled'].includes(status))
    return NextResponse.json({ error: 'That update could not be saved.' }, { status: 400 })

  const { data, error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Could not update the appointment.' }, { status: 500 })
  return NextResponse.json({ appointment: data })
}
