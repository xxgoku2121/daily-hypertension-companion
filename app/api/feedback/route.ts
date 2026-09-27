import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const CATEGORIES = ['suggestion', 'problem', 'praise', 'other'] as const

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })

  let body: { category?: string; message?: string; page?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'That did not come through. Please try again.' }, { status: 400 })
  }

  const category = CATEGORIES.includes(body.category as (typeof CATEGORIES)[number])
    ? body.category!
    : 'suggestion'
  const message = (body.message ?? '').trim()
  if (!message) {
    return NextResponse.json({ error: 'Please write a little about your idea first.' }, { status: 400 })
  }

  const { error } = await supabase.from('feedback').insert({
    user_id: user.id,
    category,
    message: message.slice(0, 2000),
    page: body.page?.slice(0, 120) ?? null,
  })

  if (error) {
    return NextResponse.json({ error: 'We could not save that. Please try again.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
