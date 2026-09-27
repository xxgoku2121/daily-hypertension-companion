import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Exchanges the Supabase email-confirmation `code` for a session.
 * Configure Supabase Auth -> URL Configuration -> Redirect URLs to include:
 *   https://daily-hypertension-companion.vercel.app/auth/callback
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Only allow in-app redirect targets; anything else falls back to /home.
  const rawNext = searchParams.get('next') ?? '/home'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/home'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=confirm`)
}
