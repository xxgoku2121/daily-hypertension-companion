'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  api,
  useProfile,
  PageHeader,
  Card,
  SectionTitle,
  Field,
  EmptyState,
  ErrorNote,
  inputCls,
  btnPrimary,
  btnSecondary,
} from '../_ui'

const OTHER_ACTIVITIES = ['Gardening', 'Cycling', 'Housework', 'Stretching', 'Swimming', 'Other']

interface DayMetric {
  date: string
  walking_minutes: number
  steps: number
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function ActivityPage() {
  const profile = useProfile()
  const [days, setDays] = useState<DayMetric[]>([])
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef<number | null>(null)
  const timer = useRef<number | null>(null)

  const [stepsInput, setStepsInput] = useState('')
  const [showSteps, setShowSteps] = useState(false)
  const [activityType, setActivityType] = useState(OTHER_ACTIVITIES[0])
  const [activityMinutes, setActivityMinutes] = useState('')
  const [showOther, setShowOther] = useState(false)
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const r = await api<{ metrics: any[] }>(`/api/daily-metrics?days=7`)
      setDays(
        (r.metrics ?? []).map((m) => ({
          date: m.date,
          walking_minutes: m.walking_minutes || 0,
          steps: m.steps || 0,
        }))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load activity.')
    }
  }
  useEffect(() => {
    load()
  }, [])

  function startWalk() {
    startedAt.current = Date.now()
    setElapsed(0)
    setRunning(true)
    timer.current = window.setInterval(() => {
      if (startedAt.current) setElapsed(Math.floor((Date.now() - startedAt.current) / 1000))
    }, 1000)
  }

  async function stopWalk() {
    if (timer.current) window.clearInterval(timer.current)
    setRunning(false)
    const done = startedAt.current ? Math.max(1, Math.round((Date.now() - startedAt.current) / 60000)) : 0
    startedAt.current = null
    setElapsed(0)
    if (done > 0) {
      try {
        await api('/api/daily-metrics', {
          method: 'PATCH',
          body: JSON.stringify({ date: today(), walking_minutes: done }),
        })
        load()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save your walk.')
      }
    }
  }

  async function saveSteps() {
    const n = Math.max(0, Math.round(Number(stepsInput) || 0))
    setSaving(true)
    try {
      await api('/api/daily-metrics', {
        method: 'PATCH',
        body: JSON.stringify({ date: today(), steps: n }),
      })
      setStepsInput('')
      setShowSteps(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save steps.')
    } finally {
      setSaving(false)
    }
  }

  async function saveOther() {
    const n = Math.max(1, Math.round(Number(activityMinutes) || 0))
    if (!Number.isFinite(n) || n <= 0) {
      setError('Please enter how many minutes.')
      return
    }
    setSaving(true)
    try {
      await api('/api/daily-metrics', {
        method: 'PATCH',
        body: JSON.stringify({ date: today(), walking_minutes: n }),
      })
      setActivityMinutes('')
      setShowOther(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save activity.')
    } finally {
      setSaving(false)
    }
  }

  function fmt(sec: number) {
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
  }

  const target = profile?.step_target || 6000
  const todayRow = days.find((d) => d.date === today())
  const minutes = todayRow?.walking_minutes ?? 0
  const steps = todayRow?.steps ?? 0
  const weekMinutes = days.reduce((s, d) => s + d.walking_minutes, 0)
  const maxDay = Math.max(1, ...days.map((d) => d.walking_minutes))

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader title="Activity" subtitle="A short walk is good for your blood pressure. The timer keeps track for you." />
      <ErrorNote message={error} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <Card className="mb-6 text-center">
            <SectionTitle>Walk timer</SectionTitle>
            {running ? (
              <div>
                <p className="text-5xl font-bold text-primary my-4" role="timer" aria-live="polite">
                  {fmt(elapsed)}
                </p>
                <p className="text-text-secondary mb-4">Nice going — keep at your own pace.</p>
                <button className={btnPrimary} onClick={stopWalk}>
                  Stop walk
                </button>
              </div>
            ) : (
              <div>
                <p className="text-text-secondary mb-4">Tap start when you head out. We will add the minutes when you stop.</p>
                <button className={btnPrimary} onClick={startWalk}>
                  Start walk
                </button>
              </div>
            )}
          </Card>

          <Card className="mb-6">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle>Today</SectionTitle>
              <div className="flex gap-2">
                <button className={btnSecondary} onClick={() => setShowOther((s) => !s)}>
                  + Other activity
                </button>
                <button className={btnSecondary} onClick={() => setShowSteps((s) => !s)}>
                  Log steps
                </button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <div className="rounded-xl bg-surface-secondary p-4">
                <p className="text-sm font-semibold text-text-secondary">Movement</p>
                <p className="text-3xl font-bold text-text-primary">{minutes} <span className="text-base font-normal">min</span></p>
                <p className="text-sm text-text-secondary">This week: {weekMinutes} min</p>
              </div>
              <div className="rounded-xl bg-surface-secondary p-4">
                <p className="text-sm font-semibold text-text-secondary">Steps</p>
                <p className="text-3xl font-bold text-text-primary">{steps.toLocaleString()}</p>
                <p className="text-sm text-text-secondary">Target: {target.toLocaleString()}</p>
              </div>
            </div>
            {showSteps && (
              <div className="mt-4 rounded-xl bg-surface-secondary p-4">
                <Field label="Steps today (enter by hand — your phone doesn't share steps with Steady yet)">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={0}
                      value={stepsInput}
                      onChange={(e) => setStepsInput(e.target.value)}
                      placeholder="e.g. 4500"
                      className={inputCls}
                    />
                    <button className={btnPrimary} disabled={saving} onClick={saveSteps}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </Field>
              </div>
            )}
            {showOther && (
              <div className="mt-4 rounded-xl bg-surface-secondary p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Activity">
                    <select value={activityType} onChange={(e) => setActivityType(e.target.value)} className={inputCls}>
                      {OTHER_ACTIVITIES.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Minutes">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={1}
                        value={activityMinutes}
                        onChange={(e) => setActivityMinutes(e.target.value)}
                        placeholder="e.g. 20"
                        className={inputCls}
                      />
                      <button className={btnPrimary} disabled={saving} onClick={saveOther}>
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </Field>
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  Logged as movement minutes for today. Go at your own pace — something gentle counts.
                </p>
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle>This week</SectionTitle>
            {days.every((d) => d.walking_minutes === 0) ? (
              <EmptyState>Nothing logged yet this week. A short walk is a fine start.</EmptyState>
            ) : (
              <div className="mt-3 flex items-end justify-between gap-1" role="img" aria-label={`Movement minutes this week: ${weekMinutes} total`}>
                {[...days].reverse().map((d) => (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className={`w-full rounded-t-md ${d.walking_minutes > 0 ? 'bg-primary' : 'bg-surface-secondary'}`}
                      style={{ height: `${Math.max(8, (d.walking_minutes / maxDay) * 72)}px` }}
                      title={`${d.walking_minutes} min`}
                    />
                    <span className="text-sm font-semibold text-text-secondary">
                      {new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-6" aria-label="Movement guidance">
          <Card>
            <SectionTitle>A gentle target</SectionTitle>
            <p className="text-lg text-text-primary">
              Regular movement helps lower blood pressure. A common goal is about
              150 minutes of moderate activity a week — but any movement counts,
              and short walks are a fine place to start.
            </p>
            <a
              href="https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-lg font-semibold text-primary underline"
            >
              Read the AHA guidance
            </a>
          </Card>
          <Link
            href="/guide"
            className="block rounded-2xl border border-border bg-surface p-6 shadow-sm transition hover:shadow"
          >
            <p className="text-xl font-bold text-text-primary">💬 Ask about movement</p>
            <p className="mt-1 text-base text-text-secondary">
              The Health Guide can suggest a pace that fits your back and your blood pressure.
            </p>
          </Link>
        </aside>
      </div>
    </main>
  )
}
