import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET -> { profile } (null when the user has no profile row yet)
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not load your profile.' }, { status: 500 })
  return NextResponse.json({ profile: data ?? null })
}

const ALLOW = new Set([
  'name',
  'age',
  'conditions',
  'sodium_target',
  'step_target',
  'text_size',
  'appearance',
  'reduce_motion',
  'notifications',
  'ai_history',
  'guide_permissions',
  'onboarding_state',
  'timezone',
])

const TEXT_SIZES = ['normal', 'large', 'extra_large']
const APPEARANCES = ['system', 'light', 'blue', 'dark', 'high_contrast']

// PATCH -> accepts any subset of the allowed fields (single-field autosave OK).
// Creates the profile row on first save.
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Could not read that update.' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (!ALLOW.has(key)) continue
    updates[key] = body[key]
  }
  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })

  if ('text_size' in updates && !TEXT_SIZES.includes(String(updates.text_size)))
    return NextResponse.json({ error: 'That text size is not supported.' }, { status: 400 })
  if ('appearance' in updates && !APPEARANCES.includes(String(updates.appearance)))
    return NextResponse.json({ error: 'That appearance is not supported.' }, { status: 400 })
  for (const arr of ['conditions', 'guide_permissions']) {
    if (arr in updates && !Array.isArray(updates[arr]))
      return NextResponse.json({ error: 'That value could not be saved.' }, { status: 400 })
  }
  if ('timezone' in updates) {
    const tz = String(updates.timezone)
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz })
    } catch {
      return NextResponse.json({ error: 'That timezone is not supported.' }, { status: 400 })
    }
    updates.timezone = tz
  }

  updates.id = user.id
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('profiles')
    .upsert(updates, { onConflict: 'id' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })
  return NextResponse.json({ profile: data })
}
