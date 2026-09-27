import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/ui'

/**
 * Authenticated shell. proxy.ts already keeps logged-out users away from
 * these routes; this double-checks on the server and renders the sidebar /
 * bottom-nav shell. The client-side onboarding guard inside <AppShell>
 * reroutes users who have not finished setup to /onboarding.
 */
export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <AppShell userId={user.id} userName={profile?.name ?? null}>
      {children}
    </AppShell>
  )
}
