import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getNextAction } from '@/lib/next-action'

/** GET /api/next-action — the single next step for the Home screen. */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  try {
    const action = await getNextAction(supabase, user.id)
    return NextResponse.json(action)
  } catch {
    return NextResponse.json(
      { error: 'Could not load your next step.' },
      { status: 500 }
    )
  }
}
