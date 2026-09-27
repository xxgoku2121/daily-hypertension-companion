'use client'

import { useEffect, useRef, useState } from 'react'
import {
  api,
  useProfile,
  textSizeClass,
  PageHeader,
  Card,
  SectionTitle,
  ErrorNote,
  btnPrimary,
  btnSecondary,
} from '../_ui'

const ANSWERS = [
  { value: 'no', label: 'No' },
  { value: 'sometimes', label: 'Sometimes' },
  { value: 'yes', label: 'Yes' },
  { value: 'prefer_not', label: 'Prefer not to say' },
]

const STRATEGIES = ['Deep breathing', 'A glass of water', 'A short walk', 'Call someone', 'Wait it out']

function fmtClock(totalSec: number) {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function HabitsPage() {
  const profile = useProfile()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [hasRecords, setHasRecords] = useState(false)
  const [strategies, setStrategies] = useState<any[]>([])
  const [recent, setRecent] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  // craving timer state
  const [craving, setCraving] = useState(false)
  const [left, setLeft] = useState(300)
  const [strategy, setStrategy] = useState(STRATEGIES[0])
  const [done, setDone] = useState(false)
  const timer = useRef<number | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await api<{ nicotine_status: string | null; has_records: boolean; records: any[]; strategies: any[] }>('/api/habits')
      setStatus(r.nicotine_status)
      setHasRecords(r.has_records)
      setStrategies(r.strategies)
      setRecent(r.records)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this page.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function answer(value: string) {
    setSaving(true)
    setError(null)
    try {
      const r = await api<{ nicotine_status: string }>('/api/habits', {
        method: 'PATCH',
        body: JSON.stringify({ nicotine_status: value }),
      })
      setStatus(r.nicotine_status)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your answer.')
    } finally {
      setSaving(false)
    }
  }

  function startCraving() {
    setCraving(true)
    setDone(false)
    setLeft(300)
    timer.current = window.setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          if (timer.current) window.clearInterval(timer.current)
          setDone(true)
          return 0
        }
        return l - 1
      })
    }, 1000)
  }

  function cancelCraving() {
    if (timer.current) window.clearInterval(timer.current)
    setCraving(false)
    setDone(false)
  }

  async function finishCraving(helped: boolean) {
    if (timer.current) window.clearInterval(timer.current)
    try {
      await api('/api/habits', {
        method: 'POST',
        body: JSON.stringify({ kind: 'craving_resisted', trigger: 'craving', strategy_used: strategy, strategy_helped: helped }),
      })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.')
    } finally {
      setCraving(false)
      setDone(false)
    }
  }

  async function logUse() {
    try {
      await api('/api/habits', { method: 'POST', body: JSON.stringify({ kind: 'smoking_event' }) })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.')
    }
  }

  const optedIn = status === 'sometimes' || status === 'yes'
  const showSupport = optedIn || hasRecords

  return (
    <main className={`mx-auto max-w-3xl px-4 py-8 ${textSizeClass(profile?.text_size)}`}>
      <PageHeader title="Habits" subtitle="Support for cravings — only if you want it." />
      <ErrorNote message={error} />

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : !showSupport ? (
        status === null ? (
          /* Neutral, one-time question. No assumptions. */
          <Card>
            <SectionTitle>One quick question</SectionTitle>
            <p className="text-slate-700 mb-4">
              Do you currently use nicotine (cigarettes, vapes, or other tobacco)? You can skip this — or change your
              answer any time.
            </p>
            <div className="flex flex-wrap gap-2">
              {ANSWERS.map((a) => (
                <button
                  key={a.value}
                  className={btnSecondary}
                  disabled={saving}
                  onClick={() => answer(a.value)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Card>
        ) : (
          /* Answered no / prefer not to say, and no records: stay out of the way */
          <Card>
            <SectionTitle>All set</SectionTitle>
            <p className="text-slate-700 mb-4">
              Thanks — this section will stay out of your way.
            </p>
            <button className="text-sm font-semibold text-slate-500 underline" onClick={() => setStatus(null)}>
              Change my answer
            </button>
          </Card>
        )
      ) : (
        /* Opted in or has real records: show craving support */
        <div className="space-y-6">
          <Card className="text-center">
            <SectionTitle>Having a craving?</SectionTitle>
            {!craving ? (
              <div>
                <p className="text-slate-600 mb-4">
                  Most cravings pass in a few minutes. Ride this one out with a 5-minute timer.
                </p>
                <button className={btnPrimary} onClick={startCraving}>
                  I'm having a craving
                </button>
                <div className="mt-4">
                  <button className="text-sm font-semibold text-slate-500 underline" onClick={logUse}>
                    Log a use instead
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-5xl font-bold text-blue-800 my-4" role="timer" aria-live="polite">
                  {fmtClock(left)}
                </p>
                <label className="block text-left mb-4">
                  <span className="block text-sm font-semibold text-slate-700 mb-1">Try this while you wait</span>
                  <select value={strategy} onChange={(e) => setStrategy(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3">
                    {[...new Set([...strategies.map((s: any) => s.strategy), ...STRATEGIES])].map((s: string) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                {done || left === 0 ? (
                  <div>
                    <p className="font-semibold text-slate-800 mb-3">Time's up. Did that strategy help?</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button className={btnPrimary} onClick={() => finishCraving(true)}>Yes, it helped</button>
                      <button className={btnSecondary} onClick={() => finishCraving(false)}>Not really</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap justify-center gap-2">
                    <button className={btnSecondary} onClick={() => { if (timer.current) window.clearInterval(timer.current); setDone(true) }}>
                      Craving passed early
                    </button>
                    <button className="text-sm font-semibold text-slate-500 underline" onClick={cancelCraving}>
                      Stop
                    </button>
                  </div>
                )}
              </div>
            )}
          </Card>

          {recent.length > 0 && (
            <Card>
              <SectionTitle>Recent</SectionTitle>
              <ul className="divide-y divide-slate-100">
                {recent.slice(0, 10).map((r) => (
                  <li key={r.id} className="py-3 flex flex-wrap justify-between gap-2">
                    <p className="text-slate-800">
                      {r.kind === 'craving_resisted' ? 'Craving rode out' : r.kind === 'smoking_event' ? 'Use logged' : 'Craving logged'}
                      {r.strategy_used ? ` · ${r.strategy_used}` : ''}
                    </p>
                    <p className="text-sm text-slate-500">
                      {new Date(r.logged_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <p className="text-center">
            <button className="text-sm font-semibold text-slate-500 underline" onClick={() => setStatus(null)}>
              Change my answer about nicotine use
            </button>
          </p>
        </div>
      )}
    </main>
  )
}
