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

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function ActivityPage() {
  const profile = useProfile()
  const [minutes, setMinutes] = useState(0)
  const [steps, setSteps] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef<number | null>(null)
  const timer = useRef<number | null>(null)

  async function load() {
    try {
      const r = await api<{ metrics: any[] }>(`/api/daily-metrics?days=1`)
      const row = r.metrics.find((m) => m.date === today())
      setMinutes(row?.walking_minutes || 0)
      setSteps(row?.steps || 0)
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
        const r = await api<{ metrics: any }>('/api/daily-metrics', {
          method: 'PATCH',
          body: JSON.stringify({ date: today(), walking_minutes: done }),
        })
        setMinutes(r.metrics.walking_minutes || 0)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save your walk.')
      }
    }
  }

  function fmt(sec: number) {
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
  }

  const target = profile?.step_target || 6000

  return (
    <main className={`mx-auto max-w-3xl px-4 py-8 ${textSizeClass(profile?.text_size)}`}>
      <PageHeader title="Activity" subtitle="A short walk is good for your blood pressure. The timer keeps track for you." />
      <ErrorNote message={error} />

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

      <Card>
        <SectionTitle>Today</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-surface-secondary p-4">
            <p className="text-sm font-semibold text-text-secondary">Walking</p>
            <p className="text-3xl font-bold text-text-primary">{minutes} <span className="text-base font-normal">min</span></p>
          </div>
          <div className="rounded-xl bg-surface-secondary p-4">
            <p className="text-sm font-semibold text-text-secondary">Steps</p>
            <p className="text-3xl font-bold text-text-primary">{steps.toLocaleString()}</p>
            <p className="text-sm text-text-secondary">Target: {target.toLocaleString()}</p>
          </div>
        </div>
        <p className="text-sm text-text-secondary mt-4">
          Steps can be updated if your phone or watch shares them later.
        </p>
      </Card>
    </main>
  )
}
