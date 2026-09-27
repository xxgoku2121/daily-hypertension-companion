'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// ---- fetch helper: never surfaces raw technical errors to the user ----
export async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) },
  })
  if (res.status === 401) throw new Error('Please sign in again.')
  if (!res.ok) {
    const j = await res.json().catch(() => null)
    throw new Error(j?.error || 'Something went wrong. Please try again.')
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ---- "Saved ✓" feedback for autosave ----
export function useSaved() {
  const [saved, setSaved] = useState(false)
  const timer = useRef<number | null>(null)
  const show = () => {
    setSaved(true)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setSaved(false), 2200)
  }
  const el = saved ? (
    <span role="status" className="text-sm font-semibold text-green-700">
      Saved ✓
    </span>
  ) : null
  return { show, el }
}

// ---- profile (for text size / targets) ----
export interface ProfileLike {
  name: string | null
  sodium_target: number
  step_target: number
  text_size: 'normal' | 'large' | 'extra_large'
  [k: string]: unknown
}

export function textSizeClass(textSize: string | undefined) {
  if (textSize === 'large') return 'text-[1.08rem]'
  if (textSize === 'extra_large') return 'text-[1.18rem]'
  return ''
}

export function useProfile() {
  const [profile, setProfile] = useState<ProfileLike | null>(null)
  useEffect(() => {
    api<{ profile: ProfileLike | null }>('/api/profile')
      .then((r) => setProfile(r.profile))
      .catch(() => {})
  }, [])
  return profile
}

// ---- layout pieces ----
export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-600 max-w-2xl">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-bold text-slate-900 mb-3">{children}</h2>
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-sm text-slate-500 mt-1">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100'

export const btnPrimary =
  'inline-flex items-center justify-center rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-50'

export const btnSecondary =
  'inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50'

export const btnDanger =
  'inline-flex items-center justify-center rounded-xl bg-red-700 px-5 py-3 font-semibold text-white hover:bg-red-800 disabled:opacity-50'

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left"
    >
      <span>
        <span className="block font-semibold text-slate-900">{label}</span>
        {description && <span className="block text-sm text-slate-500">{description}</span>}
      </span>
      <span
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-blue-700' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-7' : 'translate-x-1'
          }`}
        />
      </span>
    </button>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">
      {children}
    </div>
  )
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-800">
      {message}
    </p>
  )
}

// Print styling: hide everything except .print-area
export function PrintStyles() {
  return (
    <style>{`
      @media print {
        body * { visibility: hidden; }
        .print-area, .print-area * { visibility: visible; }
        .print-area { position: absolute; left: 0; top: 0; width: 100%; }
        .no-print { display: none !important; }
      }
    `}</style>
  )
}

export function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
