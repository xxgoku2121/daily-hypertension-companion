import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function authed() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

async function audit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user_id: string,
  caregiver_name: string,
  action: string,
  old_value: unknown,
  new_value: unknown
) {
  await supabase.from('caregiver_audit').insert({
    user_id,
    caregiver_name,
    action,
    old_value: old_value ?? null,
    new_value: new_value ?? null,
  })
}

// GET -> { caregivers, audit }
export async function GET() {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const [c, a] = await Promise.all([
    supabase
      .from('caregiver_permissions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('caregiver_audit')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100),
  ])
  if (c.error) return NextResponse.json({ error: 'Could not load caregivers.' }, { status: 500 })
  return NextResponse.json({ caregivers: c.data, audit: a.data ?? [] })
}

// POST {name, relationship?, permissions[]?, active?} — writes an audit row.
export async function POST(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { name, relationship, permissions, active } = body
  if (!name || !String(name).trim())
    return NextResponse.json({ error: 'Please give the caregiver a name.' }, { status: 400 })

  const row = {
    user_id: user.id,
    name: String(name).trim(),
    relationship: relationship || null,
    permissions: Array.isArray(permissions) ? permissions : [],
    active: active !== false,
  }
  const { data, error } = await supabase.from('caregiver_permissions').insert(row).select().single()
  if (error) return NextResponse.json({ error: 'Could not add the caregiver.' }, { status: 500 })

  await audit(supabase, user.id, row.name, 'added', null, data)
  return NextResponse.json({ caregiver: data }, { status: 201 })
}

// PATCH {id, name?, relationship?, permissions?, active?} — writes an audit row.
export async function PATCH(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { id, name, relationship, permissions, active } = body
  if (!id) return NextResponse.json({ error: 'That update could not be saved.' }, { status: 400 })

  const { data: old } = await supabase
    .from('caregiver_permissions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!old) return NextResponse.json({ error: 'That caregiver was not found.' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = String(name).trim() || old.name
  if (relationship !== undefined) updates.relationship = relationship || null
  if (permissions !== undefined && Array.isArray(permissions)) updates.permissions = permissions
  if (active !== undefined) updates.active = !!active

  const { data, error } = await supabase
    .from('caregiver_permissions')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Could not update the caregiver.' }, { status: 500 })

  const action =
    'active' in updates && !updates.active && old.active
      ? 'revoked'
      : 'active' in updates && updates.active && !old.active
        ? 'reinstated'
        : 'updated'
  await audit(supabase, user.id, data.name, action, old, data)
  return NextResponse.json({ caregiver: data })
}
