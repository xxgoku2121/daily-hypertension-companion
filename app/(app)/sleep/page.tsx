'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  api,
  useProfile,
  PageHeader,
  Card,
  SectionTitle,
  Field,
  ErrorNote,
  inputCls,
  btnPrimary,
} from '../_ui'

const QUALITIES = [
  { value: 'rested', label: '😊 Rested', short: 'Rested' },
  { value: 'okay', label: '😐 Okay', short: 'Okay' },
  { value: 'restless', label: '😟 Restless', short: 'Restless' },
] as const

function today() {
  return new Date().toISOString().slice(0, 10)
}

interface Night {
  date: string
  sleep_hours: number | null
  sleep_quality: string | null
  bedtime: string | null
  wake_time: string | null
}

export default function SleepPage() {
  const profile = useProfile()
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<Night[]>([])

  const [hours, setHours] = useState('')
  const [quality, setQuality] = useState<string>('')
  const [bedtime, setBedtime] = useState('')
  const [wake, setWake] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedNote, setSavedNote] = useState(false)

  async function load() {
    try {
      const r = await api<{ metrics: any[] }>('/api/daily-metrics?days=7')
      setRecent(
        (r.metrics ?? []).map((m) => ({
          date: m.date,
          sleep_hours: m.sleep_hours ?? null,
          sleep_quality: m.sleep_quality ?? null,
          bedtime: m.bedtime ?? null,
          wake_time: m.wake_time ?? null,
        }))
      )
      const t = r.metrics.find((m) => m.date === today())
      if (t) {
        if (t.sleep_hours != null) setHours(String(t.sleep_hours))
        if (t.sleep_quality) setQuality(t.sleep_quality)
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
          sleep_quality: quality || null,
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

  const loggedNights = recent.filter((r) => r.sleep_hours != null)
  const maxHours = Math.max(9, ...loggedNights.map((r) => r.sleep_hours ?? 0))
  const qualityLabel = (q: string | null) =>
    QUALITIES.find((x) => x.value === q)?.short ?? null

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader title="Sleep" subtitle="How did you sleep last night? It affects your blood pressure." />
      <ErrorNote message={error} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
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
            <Field label="How did you feel this morning?">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sleep quality">
                {QUALITIES.map((q) => (
                  <button
                    key={q.value}
                    type="button"
                    role="radio"
                    aria-checked={quality === q.value}
                    onClick={() => setQuality(quality === q.value ? '' : q.value)}
                    className={`min-h-[56px] rounded-xl border-2 px-5 text-lg font-semibold ${
                      quality === q.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-text-primary'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </Field>
            <div className="mt-4 flex items-center gap-4">
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

          <Card className="mb-6">
            <SectionTitle>Your week</SectionTitle>
            {loggedNights.length === 0 ? (
              <p className="text-text-secondary">No sleep logged yet — tonight&apos;s a good night to start.</p>
            ) : (
              <div>
                <div className="mt-3 flex items-end justify-between gap-1" role="img" aria-label={`Sleep hours this week, target 7 to 9 hours`}>
                  {[...recent].reverse().map((r) => {
                    const h = r.sleep_hours ?? 0
                    return (
                      <div key={r.date} className="flex flex-1 flex-col items-center gap-1">
                        <div className="flex w-full items-end justify-center" style={{ height: '96px' }}>
                          {h > 0 ? (
                            <div
                              className={`w-full rounded-t-md ${h >= 7 && h <= 9 ? 'bg-success' : h >= 6 ? 'bg-warning' : 'bg-danger'}`}
                              style={{ height: `${Math.max(8, (h / maxHours) * 96)}px` }}
                              title={`${h} hours${qualityLabel(r.sleep_quality) ? ` · ${qualityLabel(r.sleep_quality)}` : ''}`}
                            />
                          ) : (
                            <div className="w-full rounded-t-md bg-surface-secondary" style={{ height: '8px' }} />
                          )}
                        </div>
                        <span className="text-sm font-semibold text-text-secondary">
                          {new Date(`${r.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  Green: 7–9 hours. Yellow: around 6. Red: under 6. Hover or tap a bar for details.
                </p>
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle>Recent nights</SectionTitle>
            {loggedNights.length === 0 ? (
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
                      {qualityLabel(r.sleep_quality) ? ` · ${qualityLabel(r.sleep_quality)}` : ''}
                      {r.bedtime ? ` · bed ${r.bedtime}` : ''}
                      {r.wake_time ? ` · up ${r.wake_time}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-6" aria-label="Sleep guidance">
          <Card>
            <SectionTitle>Logged by hand</SectionTitle>
            <p className="text-lg text-text-primary">
              Steady doesn&apos;t pull sleep from your phone or watch yet — everything here
              is what you enter. A minute in the morning is all it takes.
            </p>
          </Card>
          <Card>
            <SectionTitle>Sleep and blood pressure</SectionTitle>
            <p className="text-lg text-text-primary">
              Poor sleep can raise blood pressure the next day. Most adults feel best
              with 7–9 hours — and a regular bedtime matters as much as the total.
            </p>
            <a
              href="https://www.heart.org/en/healthy-living/healthy-lifestyle/sleep"
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
            <p className="text-xl font-bold text-text-primary">💬 Ask about sleep</p>
            <p className="mt-1 text-base text-text-secondary">
              The Health Guide knows your recent nights and can talk through what might help.
            </p>
          </Link>
        </aside>
      </div>
    </main>
  )
}
