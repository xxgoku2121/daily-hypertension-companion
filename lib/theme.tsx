'use client'

/* ThemeProvider — applies the user's appearance / text size / reduce-motion
   preferences as data attributes on <html> so globals.css tokens take effect.
   - Reads profiles.appearance, profiles.text_size, profiles.reduce_motion
     (passed as `initial` from the server layout).
   - Caches the resolved theme in localStorage ('hc-theme') for fast startup;
     an inline script in app/layout.tsx applies the cache before first paint.
   - The 'system' theme resolves via the CSS prefers-color-scheme media query
     in globals.css, which listens to OS changes live. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Appearance, TextSize } from './types'
import { THEME_STORAGE_KEY } from './theme-key'

export { THEME_STORAGE_KEY }

export interface ThemePrefs {
  appearance: Appearance
  text_size: TextSize
  reduce_motion: boolean
}

interface ThemeContextValue extends ThemePrefs {
  setAppearance: (a: Appearance) => void
  setTextSize: (t: TextSize) => void
  setReduceMotion: (r: boolean) => void
  /** Persist the current prefs (also writes them to the DB via `persist`). */
  save: (persist: (prefs: ThemePrefs) => Promise<void>) => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const DEFAULTS: ThemePrefs = {
  appearance: 'system',
  text_size: 'normal',
  reduce_motion: false,
}

function readCache(): Partial<ThemePrefs> | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed
  } catch {
    return null
  }
}

function applyToDocument(prefs: ThemePrefs) {
  const el = document.documentElement
  el.setAttribute('data-theme', prefs.appearance)
  el.setAttribute('data-text-size', prefs.text_size)
  el.setAttribute('data-reduce-motion', prefs.reduce_motion ? 'true' : 'false')
  // Also hint the browser UI (scrollbars, form controls).
  el.style.colorScheme =
    prefs.appearance === 'dark'
      ? 'dark'
      : prefs.appearance === 'light' ||
          prefs.appearance === 'blue' ||
          prefs.appearance === 'high_contrast'
        ? 'light'
        : 'light dark'
}

function writeCache(prefs: ThemePrefs) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
}

export function ThemeProvider({
  children,
  initial,
}: {
  children: ReactNode
  initial?: Partial<ThemePrefs> | null
}) {
  // Fast path: localStorage cache wins on first paint; server values fill gaps.
  const [prefs, setPrefs] = useState<ThemePrefs>(() => {
    if (typeof window === 'undefined') return { ...DEFAULTS, ...initial }
    const cached = readCache()
    return { ...DEFAULTS, ...initial, ...cached }
  })

  useEffect(() => {
    applyToDocument(prefs)
    writeCache(prefs)
  }, [prefs])

  // The database is the source of truth. If the server-provided prefs differ
  // from what the local cache resolved to (changed on another device, or
  // saved before settings applied themes live), adopt the server values so
  // the saved choice actually takes effect. The prefs effect below then
  // repaints the document and rewrites the cache.
  useEffect(() => {
    if (!initial) return
    setPrefs((p) => {
      const next = { ...p }
      let changed = false
      if (initial.appearance && initial.appearance !== p.appearance) {
        next.appearance = initial.appearance
        changed = true
      }
      if (initial.text_size && initial.text_size !== p.text_size) {
        next.text_size = initial.text_size
        changed = true
      }
      if (
        typeof initial.reduce_motion === 'boolean' &&
        initial.reduce_motion !== p.reduce_motion
      ) {
        next.reduce_motion = initial.reduce_motion
        changed = true
      }
      return changed ? next : p
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setAppearance = useCallback(
    (appearance: Appearance) => setPrefs((p) => ({ ...p, appearance })),
    []
  )
  const setTextSize = useCallback(
    (text_size: TextSize) => setPrefs((p) => ({ ...p, text_size })),
    []
  )
  const setReduceMotion = useCallback(
    (reduce_motion: boolean) => setPrefs((p) => ({ ...p, reduce_motion })),
    []
  )
  const save = useCallback(
    async (persist: (p: ThemePrefs) => Promise<void>) => {
      await persist(prefs)
      writeCache(prefs)
    },
    [prefs]
  )

  return (
    <ThemeContext.Provider
      value={{
        ...prefs,
        setAppearance,
        setTextSize,
        setReduceMotion,
        save,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}

/** Imperatively apply theme prefs outside React (e.g. onboarding). */
export function applyThemePrefs(prefs: ThemePrefs) {
  applyToDocument(prefs)
  writeCache(prefs)
}
