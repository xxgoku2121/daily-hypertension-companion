import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return err('Please sign in first.', 401)

  const { id } = await params
  if (!id) return err('No reading was specified.')

  const { data, error } = await db
    .from('bp_readings')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')

  if (error) return err("We couldn't delete that reading. Please try again.", 500)
  if (!data || data.length === 0) return err("We couldn't find that reading.", 404)
  return NextResponse.json({ ok: true })
}
