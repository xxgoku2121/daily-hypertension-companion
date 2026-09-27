import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import { ThemeProvider } from '@/lib/theme'
import { THEME_STORAGE_KEY } from '@/lib/theme-key'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Steady — Daily Hypertension Companion',
  description:
    'Steady — your simple daily health companion for blood pressure, medicine, and gentle guidance.',
}

/**
 * Inline theme bootstrap: applies the cached theme (data-theme,
 * data-text-size, data-reduce-motion) before first paint so the page
 * never flashes the wrong theme on startup.
 */
const THEME_BOOTSTRAP = `(function(){try{var t=JSON.parse(localStorage.getItem('${THEME_STORAGE_KEY}')||'null');if(!t)return;var r=document.documentElement;if(t.appearance)r.setAttribute('data-theme',t.appearance);if(t.text_size)r.setAttribute('data-text-size',t.text_size);r.setAttribute('data-reduce-motion',t.reduce_motion?'true':'false');}catch(e){}})();`

export default async function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  // Server-provided theme defaults (used when there is no local cache).
  type ThemeInitial = {
    appearance?: 'system' | 'light' | 'blue' | 'dark' | 'high_contrast'
    text_size?: 'normal' | 'large' | 'extra_large'
    reduce_motion?: boolean
  }
  let initial: ThemeInitial | null = null

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('appearance, text_size, reduce_motion')
        .eq('id', user.id)
        .single()
      if (profile) {
        initial = {
          appearance:
            (profile.appearance as ThemeInitial['appearance']) ?? undefined,
          text_size:
            (profile.text_size as ThemeInitial['text_size']) ?? undefined,
          reduce_motion: profile.reduce_motion ?? undefined,
        }
      }
    }
  } catch {
    /* Theme defaults apply; the app still renders. */
  }

  return (
    <html
      lang="en"
      data-theme="system"
      data-text-size="normal"
      data-reduce-motion="false"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <ThemeProvider initial={initial}>{children}</ThemeProvider>
      </body>
    </html>
  )
}
