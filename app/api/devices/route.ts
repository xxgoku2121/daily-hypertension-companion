import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET -> { devices } (read-only: nothing here can fake a connection)
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { data, error } = await supabase
    .from('device_connections')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Could not load devices.' }, { status: 500 })
  return NextResponse.json({ devices: data ?? [] })
}
