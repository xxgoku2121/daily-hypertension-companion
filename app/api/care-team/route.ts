import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function authed() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

// GET -> { care_team }
export async function GET() {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { data, error } = await supabase
    .from('care_team')
    .select('*')
    .eq('user_id', user.id)
    .order('role')
  if (error) return NextResponse.json({ error: 'Could not load your care team.' }, { status: 500 })
  return NextResponse.json({ care_team: data })
}

// POST {role, name, phone?, address?, notes?}
export async function POST(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { role, name, phone, address, notes } = body
  if (!role || !name)
    return NextResponse.json(
      { error: 'Please give the person a role (like Doctor) and a name.' },
      { status: 400 }
    )

  const { data, error } = await supabase
    .from('care_team')
    .insert({
      user_id: user.id,
      role: String(role),
      name: String(name),
      phone: phone || null,
      address: address || null,
      notes: notes || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Could not add them to your care team.' }, { status: 500 })
  return NextResponse.json({ member: data }, { status: 201 })
}

// PATCH {id, role?, name?, phone?, address?, notes?}
export async function PATCH(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { id, role, name, phone, address, notes } = body
  if (!id) return NextResponse.json({ error: 'That update could not be saved.' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (role !== undefined) updates.role = String(role)
  if (name !== undefined) updates.name = String(name)
  if (phone !== undefined) updates.phone = phone || null
  if (address !== undefined) updates.address = address || null
  if (notes !== undefined) updates.notes = notes || null

  const { data, error } = await supabase
    .from('care_team')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Could not update your care team.' }, { status: 500 })
  return NextResponse.json({ member: data })
}

// DELETE ?id=...
export async function DELETE(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'That could not be removed.' }, { status: 400 })

  const { error } = await supabase.from('care_team').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Could not remove them from your care team.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
