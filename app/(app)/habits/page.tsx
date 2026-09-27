'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  api,
  useProfile,
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

const MODULE_DEFS = [
  {
    key: 'caffeine',
    icon: '☕',
    title: 'Caffeine',
    blurb: 'Caffeine can briefly raise blood pressure. A simple daily count keeps it honest.',
  },
  {
    key: 'alcohol',
    icon: '🍺',
    title: 'Alcohol',
    blurb: 'Alcohol can raise blood pressure over time. Track it only if you want to.',
  },
  {
    key: 'stress',
    icon: '😮‍💨',
    title: 'Stress',
    blurb: 'Stress spikes blood pressure. A quick check-in plus a one-minute breather.',
  },
] as const

type ModuleKey = (typeof MODULE_DEFS)[number]['key']

function fmtClock(totalSec: number) {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** One-minute guided breathing: 4s in, 4s hold, 4s out, ×5. */
function BreathingExercise() {
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<'inhale' | 'hold' | 'exhale'>('inhale')
  const [round, setRound] = useState(0)
  const timers = useRef<number[]>([])

  function stop() {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    setRunning(false)
  }

  function start() {
    stop()
    setRunning(true)
    setRound(1)
    const seq: Array<'inhale' | 'hold' | 'exhale'> = ['inhale', 'hold', 'exhale']
    let delay = 0
    for (let r = 1; r <= 5; r++) {
      for (const p of seq) {
        timers.current.push(
          window.setTimeout(() => {
            setPhase(p)
            setRound(r)
          }, delay)
        )
        delay += 4000
      }
    }
    timers.current.push(window.setTimeout(stop, delay))
  }

  useEffect(() => () => stop(), [])

  const phaseText =
    phase === 'inhale' ? 'Breathe in…' : phase === 'hold' ? 'Hold…' : 'Breathe out…'

  return (
    <div className="mt-4 rounded-2xl bg-surface-secondary p-5 text-center">
      <p className="font-bold text-text-primary">One-minute breather</p>
      {running ? (
        <div>
          <div className="mx-auto my-4 flex h-28 w-28 items-center justify-center">
            <div
              className="rounded-full bg-primary/30 transition-all duration-[4000ms] ease-in-out"
              style={{
                width: phase === 'exhale' ? '64px' : phase === 'hold' ? '112px' : '64px',
                height: phase === 'exhale' ? '64px' : phase === 'hold' ? '112px' : '64px',
                transform: phase === 'inhale' ? 'scale(1.75)' : 'scale(1)',
              }}
            />
          </div>
          <p className="text-xl font-semibold text-text-primary" aria-live="polite">
            {phaseText}
          </p>
          <p className="text-sm text-text-secondary">Round {round} of 5</p>
          <button className={btnSecondary} onClick={stop}>
            Stop
          </button>
        </div>
      ) : (
        <div>
          <p className="text-text-secondary mb-4">Slow breathing can ease a stress spike. 4 seconds in, hold, 4 out.</p>
          <button className={btnPrimary} onClick={start}>
            Start breathing
          </button>
        </div>
      )}
    </div>
  )
}

export default function HabitsPage() {
  const profile = useProfile()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [hasRecords, setHasRecords] = useState(false)
  const [modules, setModules] = useState<ModuleKey[]>([])
  const [strategies, setStrategies] = useState<any[]>([])
  const [recent, setRecent] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  // craving timer state
  const [craving, setCraving] = useState(false)
  const [left, setLeft] = useState(300)
  const [strategy, setStrategy] = useState(STRATEGIES[0])
  const [done, setDone] = useState(false)
  const timer = useRef<number | null>(null)

  // caffeine check-in
  const [cups, setCups] = useState(1)
  // stress check-in
  const [stressSaved, setStressSaved] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await api<{
        nicotine_status: string | null
        routine_modules: string[]
        has_records: boolean
        records: any[]
        strategies: any[]
      }>('/api/habits')
      setStatus(r.nicotine_status)
      setModules((r.routine_modules ?? []).filter((m): m is ModuleKey => ['caffeine', 'alcohol', 'stress'].includes(m)))
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

  async function toggleModule(key: ModuleKey) {
    const next = modules.includes(key) ? modules.filter((m) => m !== key) : [...modules, key]
    setSaving(true)
    try {
      const r = await api<{ routine_modules: string[] }>('/api/habits', {
        method: 'PATCH',
        body: JSON.stringify({ routine_modules: next }),
      })
      setModules((r.routine_modules ?? []).filter((m): m is ModuleKey => ['caffeine', 'alcohol', 'stress'].includes(m)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.')
    } finally {
      setSaving(false)
    }
  }

  async function logRoutine(kind: string, notes: string | null) {
    try {
      await api('/api/habits', { method: 'POST', body: JSON.stringify({ kind, notes }) })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.')
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

  const caffeineLogs = recent.filter((r) => r.kind === 'caffeine_log')
  const alcoholLogs = recent.filter((r) => r.kind === 'alcohol_log')
  const stressLogs = recent.filter((r) => r.kind === 'stress_checkin')

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader title="Habits & Routines" subtitle="Support for cravings and daily routines — only what you choose." />
      <ErrorNote message={error} />

      {loading ? (
        <p className="text-text-secondary">Loading…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            {/* ---------- Nicotine (unchanged careful flow) ---------- */}
            {!showSupport ? (
              status === null ? (
                <Card>
                  <SectionTitle>One quick question</SectionTitle>
                  <p className="text-text-primary mb-4">
                    Do you currently use nicotine (cigarettes, vapes, or other tobacco)? You can skip this — or change your
                    answer any time.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ANSWERS.map((a) => (
                      <button key={a.value} className={btnSecondary} disabled={saving} onClick={() => answer(a.value)}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </Card>
              ) : (
                <Card>
                  <SectionTitle>Nicotine support</SectionTitle>
                  <p className="text-text-primary mb-4">
                    Thanks — this section will stay out of your way.
                  </p>
                  <button className="text-sm font-semibold text-text-secondary underline" onClick={() => setStatus(null)}>
                    Change my answer
                  </button>
                </Card>
              )
            ) : (
              <Card className="text-center">
                <SectionTitle>Having a craving?</SectionTitle>
                {!craving ? (
                  <div>
                    <p className="text-text-secondary mb-4">
                      Most cravings pass in a few minutes. Ride this one out with a 5-minute timer.
                    </p>
                    <button className={btnPrimary} onClick={startCraving}>
                      I&apos;m having a craving
                    </button>
                    <div className="mt-4">
                      <button className="text-sm font-semibold text-text-secondary underline" onClick={logUse}>
                        Log a use instead
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-5xl font-bold text-primary my-4" role="timer" aria-live="polite">
                      {fmtClock(left)}
                    </p>
                    <label className="block text-left mb-4">
                      <span className="block text-sm font-semibold text-text-primary mb-1">Try this while you wait</span>
                      <select value={strategy} onChange={(e) => setStrategy(e.target.value)} className="w-full rounded-xl border border-border px-4 py-3">
                        {[...new Set([...strategies.map((s: any) => s.strategy), ...STRATEGIES])].map((s: string) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    {done || left === 0 ? (
                      <div>
                        <p className="font-semibold text-text-primary mb-3">Time&apos;s up. Did that strategy help?</p>
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
                        <button className="text-sm font-semibold text-text-secondary underline" onClick={cancelCraving}>
                          Stop
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}

            {/* ---------- Optional routine modules ---------- */}
            <Card>
              <SectionTitle>Routines you can add</SectionTitle>
              <p className="text-text-secondary mb-4">
                These are off until you turn them on. We never assume anything about your habits.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {MODULE_DEFS.map((m) => {
                  const on = modules.includes(m.key)
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => toggleModule(m.key)}
                      aria-pressed={on}
                      disabled={saving}
                      className={`rounded-2xl border-2 p-4 text-left transition ${
                        on ? 'border-primary bg-primary/5' : 'border-border bg-surface'
                      }`}
                    >
                      <p className="text-2xl" aria-hidden="true">{m.icon}</p>
                      <p className="mt-1 font-bold text-text-primary">{m.title}</p>
                      <p className="mt-1 text-sm text-text-secondary">{m.blurb}</p>
                      <p className={`mt-2 text-sm font-bold ${on ? 'text-primary' : 'text-text-secondary'}`}>
                        {on ? '✓ On' : '+ Add'}
                      </p>
                    </button>
                  )
                })}
              </div>
            </Card>

            {modules.includes('caffeine') && (
              <Card>
                <SectionTitle>☕ Caffeine today</SectionTitle>
                <div className="flex items-center gap-4">
                  <button
                    className={btnSecondary}
                    aria-label="Fewer drinks"
                    onClick={() => setCups((c) => Math.max(0, c - 1))}
                  >
                    −
                  </button>
                  <p className="text-2xl font-bold text-text-primary" aria-live="polite">
                    {cups} {cups === 1 ? 'drink' : 'drinks'}
                  </p>
                  <button
                    className={btnSecondary}
                    aria-label="More drinks"
                    onClick={() => setCups((c) => Math.min(8, c + 1))}
                  >
                    +
                  </button>
                  <button className={btnPrimary} onClick={() => logRoutine('caffeine_log', `${cups} drinks`)}>
                    Log
                  </button>
                </div>
                {caffeineLogs.length > 0 && (
                  <p className="mt-3 text-sm text-text-secondary">
                    Recent: {caffeineLogs.slice(0, 3).map((r) => `${r.notes ?? ''} (${new Date(r.logged_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`).join(' · ')}
                  </p>
                )}
              </Card>
            )}

            {modules.includes('alcohol') && (
              <Card>
                <SectionTitle>🍺 Alcohol today</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  <button className={btnPrimary} onClick={() => logRoutine('alcohol_log', 'yes')}>
                    Had a drink
                  </button>
                  <button className={btnSecondary} onClick={() => logRoutine('alcohol_log', 'none')}>
                    None today
                  </button>
                </div>
                {alcoholLogs.length > 0 && (
                  <p className="mt-3 text-sm text-text-secondary">
                    Recent: {alcoholLogs.slice(0, 3).map((r) => `${r.notes === 'yes' ? 'Had a drink' : 'None'} (${new Date(r.logged_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`).join(' · ')}
                  </p>
                )}
              </Card>
            )}

            {modules.includes('stress') && (
              <Card>
                <SectionTitle>😮‍💨 Stress check-in</SectionTitle>
                <p className="text-text-secondary mb-3">How&apos;s your stress right now?</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { v: 'calm', l: '😌 Calm' },
                    { v: 'tense', l: '😬 A bit tense' },
                    { v: 'stressed', l: '😰 Stressed' },
                  ].map((s) => (
                    <button
                      key={s.v}
                      className={btnSecondary}
                      onClick={() => {
                        logRoutine('stress_checkin', s.v)
                        setStressSaved(true)
                        window.setTimeout(() => setStressSaved(false), 2200)
                      }}
                    >
                      {s.l}
                    </button>
                  ))}
                </div>
                {stressSaved && (
                  <p role="status" className="mt-2 text-sm font-semibold text-success">Saved ✓</p>
                )}
                <BreathingExercise />
                {stressLogs.length > 0 && (
                  <p className="mt-3 text-sm text-text-secondary">
                    Recent check-ins: {stressLogs.slice(0, 5).map((r) => `${r.notes ?? ''}`).join(' · ')}
                  </p>
                )}
              </Card>
            )}

            {showSupport && (
              <p className="text-center">
                <button className="text-sm font-semibold text-text-secondary underline" onClick={() => setStatus(null)}>
                  Change my answer about nicotine use
                </button>
              </p>
            )}
          </div>

          {/* RIGHT COLUMN */}
          <aside className="space-y-6" aria-label="Why routines matter">
            <Card>
              <SectionTitle>Small things, real effect</SectionTitle>
              <ul className="flex flex-col gap-4 text-lg text-text-primary">
                <li className="flex gap-3">
                  <span aria-hidden="true">☕</span>
                  <span>
                    Caffeine can briefly raise blood pressure — late-day coffee can also cost you sleep.{' '}
                    <a
                      href="https://newsnetwork.mayoclinic.org/discussion/mayo-clinic-q-and-a-everyone-can-take-steps-to-help-control-blood-pressure/"
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-primary underline"
                    >
                      Mayo Clinic on caffeine &amp; blood pressure
                    </a>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden="true">🍺</span>
                  <span>
                    Even one daily drink is linked with higher blood pressure over time.{' '}
                    <a
                      href="https://newsroom.heart.org/news/routinely-drinking-alcohol-may-raise-blood-pressure-even-in-adults-without-hypertension"
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-primary underline"
                    >
                      AHA research in <em>Hypertension</em>
                    </a>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden="true">😮‍💨</span>
                  <span>
                    Stress can briefly spike blood pressure; managing stress helps keep it down.{' '}
                    <a
                      href="https://www.amerikanhastanesi.org/mayo-clinic-care-network/mayo-clinic-health-information-library/first-aid/stress-and-high-blood-pressure-what-s-the-connection"
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-primary underline"
                    >
                      Mayo Clinic on stress &amp; blood pressure
                    </a>
                  </span>
                </li>
              </ul>
            </Card>
            <Link
              href="/guide"
              className="block rounded-2xl border border-border bg-surface p-6 shadow-sm transition hover:shadow"
            >
              <p className="text-xl font-bold text-text-primary">💬 Talk it through</p>
              <p className="mt-1 text-base text-text-secondary">
                The Health Guide can help with cravings, stress, or cutting back — no judgment.
              </p>
            </Link>
          </aside>
        </div>
      )}
    </main>
  )
}
