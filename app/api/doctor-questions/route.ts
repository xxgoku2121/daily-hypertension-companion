import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function authed() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

// GET -> { questions }
export async function GET() {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { data, error } = await supabase
    .from('doctor_questions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Could not load questions.' }, { status: 500 })
  return NextResponse.json({ questions: data ?? [] })
}

// POST {question, source?}
export async function POST(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (!body.question || !String(body.question).trim())
    return NextResponse.json({ error: 'Please write the question first.' }, { status: 400 })

  const { data, error } = await supabase
    .from('doctor_questions')
    .insert({
      user_id: user.id,
      question: String(body.question).trim(),
      source: body.source === 'ai_suggested' ? 'ai_suggested' : 'user',
      status: 'kept',
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Could not save the question.' }, { status: 500 })
  return NextResponse.json({ question: data }, { status: 201 })
}

// PATCH {id, status} — kept | removed | asked
export async function PATCH(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { id, status } = body
  if (!id || !['kept', 'removed', 'asked'].includes(status))
    return NextResponse.json({ error: 'That update could not be saved.' }, { status: 400 })

  const { data, error } = await supabase
    .from('doctor_questions')
    .update({ status })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Could not update the question.' }, { status: 500 })
  return NextResponse.json({ question: data })
}

// DELETE ?id=
export async function DELETE(req: Request) {
  const { supabase, user } = await authed()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'That could not be removed.' }, { status: 400 })

  const { error } = await supabase
    .from('doctor_questions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Could not remove the question.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
