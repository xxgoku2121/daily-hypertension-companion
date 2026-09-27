import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function authed() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

const NICOTINE = ['no', 'sometimes', 'yes', 'prefer_not']
const MODULES = ['caffeine', 'alcohol', 'stress']

// GET -> { nicotine_status, routine_modules, has_records, records, strategies }
export async function GET() {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const [lp, pr, hr, us] = await Promise.all([
    supabase.from('life_profiles').select('nicotine_status').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('routine_modules').eq('id', user.id).maybeSingle(),
    supabase
      .from('habit_records')
      .select('*')
      .eq('user_id', user.id)
      .order('logged_at', { ascending: false })
      .limit(20),
    supabase
      .from('user_strategies')
      .select('*')
      .eq('user_id', user.id)
      .order('success_count', { ascending: false }),
  ])
  if (hr.error) return NextResponse.json({ error: 'Could not load habits.' }, { status: 500 })

  return NextResponse.json({
    nicotine_status: lp.data?.nicotine_status ?? null,
    routine_modules: (pr.data?.routine_modules as string[] | null) ?? [],
    has_records: (hr.data ?? []).length > 0,
    records: hr.data ?? [],
    strategies: us.data ?? [],
  })
}

// PATCH {nicotine_status?} | {routine_modules?} — explicit opt-ins only.
export async function PATCH(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const result: Record<string, unknown> = {}

  if (body.routine_modules !== undefined) {
    const mods = Array.isArray(body.routine_modules)
      ? body.routine_modules.filter((m: unknown) => MODULES.includes(String(m)))
      : []
    const { error } = await supabase
      .from('profiles')
      .update({ routine_modules: mods })
      .eq('id', user.id)
    if (error) return NextResponse.json({ error: 'Could not save that.' }, { status: 500 })
    result.routine_modules = mods
  }

  if (body.nicotine_status !== undefined) {
    if (!NICOTINE.includes(body.nicotine_status))
      return NextResponse.json({ error: 'That answer could not be saved.' }, { status: 400 })

    const { data: existing } = await supabase
      .from('life_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('life_profiles')
        .update({ nicotine_status: body.nicotine_status })
        .eq('id', existing.id)
      if (error) return NextResponse.json({ error: 'Could not save your answer.' }, { status: 500 })
    } else {
      const { error } = await supabase
        .from('life_profiles')
        .insert({ user_id: user.id, nicotine_status: body.nicotine_status })
      if (error) return NextResponse.json({ error: 'Could not save your answer.' }, { status: 500 })
    }
    result.nicotine_status = body.nicotine_status
  }

  if (Object.keys(result).length === 0)
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })
  return NextResponse.json(result)
}

// POST {kind, trigger?, strategy_used?, strategy_helped?, notes?}
export async function POST(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { kind, trigger, strategy_used, strategy_helped, notes } = body
  if (
    ![
      'smoking_event',
      'craving_event',
      'craving_resisted',
      'caffeine_log',
      'alcohol_log',
      'stress_checkin',
    ].includes(kind)
  )
    return NextResponse.json({ error: 'That could not be logged.' }, { status: 400 })

  const { data, error } = await supabase
    .from('habit_records')
    .insert({
      user_id: user.id,
      kind,
      trigger: trigger || null,
      strategy_used: strategy_used || null,
      strategy_helped: strategy_helped === undefined ? null : !!strategy_helped,
      notes: notes || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Could not log that.' }, { status: 500 })

  // Keep strategy win/loss counts honest: only count what the user reported.
  if (strategy_used && strategy_helped !== undefined) {
    const key = { user_id: user.id, trigger: trigger || 'craving', strategy: String(strategy_used) }
    const { data: s } = await supabase.from('user_strategies').select('*').match(key).maybeSingle()
    if (s) {
      await supabase
        .from('user_strategies')
        .update(
          strategy_helped
            ? { success_count: s.success_count + 1 }
            : { failure_count: s.failure_count + 1 }
        )
        .eq('id', s.id)
    } else {
      await supabase.from('user_strategies').insert({
        ...key,
        success_count: strategy_helped ? 1 : 0,
        failure_count: strategy_helped ? 0 : 1,
      })
    }
  }
  return NextResponse.json({ record: data }, { status: 201 })
}
