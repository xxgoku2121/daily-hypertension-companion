'use client'

import { useEffect, useState } from 'react'
import {
  api,
  useProfile,
  textSizeClass,
  PageHeader,
  Card,
  SectionTitle,
  Field,
  ErrorNote,
  inputCls,
  btnPrimary,
} from '../_ui'

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function SleepPage() {
  const profile = useProfile()
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<any[]>([])

  const [hours, setHours] = useState('')
  const [bedtime, setBedtime] = useState('')
  const [wake, setWake] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedNote, setSavedNote] = useState(false)

  async function load() {
    try {
      const r = await api<{ metrics: any[] }>('/api/daily-metrics?days=7')
      setRecent(r.metrics)
      const t = r.metrics.find((m) => m.date === today())
      if (t) {
        if (t.sleep_hours != null) setHours(String(t.sleep_hours))
        if (t.bedtime) setBedtime(t.bedtime)
        if (t.wake_time) setWake(t.wake_time)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load sleep records.')
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await api('/api/daily-metrics', {
        method: 'PATCH',
        body: JSON.stringify({
          date: today(),
          sleep_hours: hours === '' ? null : Number(hours),
          bedtime: bedtime || null,
          wake_time: wake || null,
        }),
      })
      setSavedNote(true)
      window.setTimeout(() => setSavedNote(false), 2200)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={`mx-auto max-w-3xl px-4 py-8 ${textSizeClass(profile?.text_size)}`}>
      <PageHeader title="Sleep" subtitle="How did you sleep last night? It affects your blood pressure." />
      <ErrorNote message={error} />

      <Card className="mb-6">
        <SectionTitle>Last night</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3 mb-4">
          <Field label="Hours slept">
            <input
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="e.g. 7.5"
              className={inputCls}
            />
          </Field>
          <Field label="Bedtime">
            <input type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Wake time">
            <input type="time" value={wake} onChange={(e) => setWake(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="flex items-center gap-4">
          <button className={btnPrimary} disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          {savedNote && (
            <span role="status" className="text-sm font-semibold text-success">
              Saved ✓
            </span>
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle>Recent nights</SectionTitle>
        {recent.filter((r) => r.sleep_hours != null).length === 0 ? (
          <p className="text-text-secondary">No sleep logged yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((r) => (
              <li key={r.date} className="py-3 flex flex-wrap justify-between gap-2">
                <p className="text-text-primary font-semibold">
                  {new Date(r.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
                <p className="text-text-secondary">
                  {r.sleep_hours != null ? `${r.sleep_hours} hours` : '—'}
                  {r.bedtime ? ` · bed ${r.bedtime}` : ''}
                  {r.wake_time ? ` · up ${r.wake_time}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  )
}
