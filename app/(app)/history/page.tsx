'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  api,
  useProfile,
  PageHeader,
  Card,
  SectionTitle,
  EmptyState,
  ErrorNote,
} from '../_ui'
import type { TimelineEvent } from '@/app/api/timeline/route'

const RANGES = [7, 30, 90] as const

const KIND_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'bp', label: '💓 BP' },
  { key: 'medication', label: '💊 Medicines' },
  { key: 'food', label: '🍽️ Food' },
  { key: 'sleep', label: '😴 Sleep' },
  { key: 'activity', label: '🚶 Activity' },
  { key: 'habit', label: '🌱 Habits' },
  { key: 'appointment', label: '📅 Appointments' },
] as const

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function HistoryPage() {
  const profile = useProfile()
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [range, setRange] = useState<(typeof RANGES)[number]>(30)
  const [filter, setFilter] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const r = await api<{ events: TimelineEvent[] }>(`/api/timeline?days=${range}`)
        if (!cancelled) setEvents(r.events ?? [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load history.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [range])

  const filtered = filter === 'all' ? events : events.filter((e) => e.kind === filter)

  const groups: { day: string; items: TimelineEvent[] }[] = []
  for (const e of filtered) {
    const day = dayKey(e.at)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push(e)
    else groups.push({ day, items: [e] })
  }

  const counts = KIND_FILTERS.filter((k) => k.key !== 'all').map((k) => ({
    ...k,
    count: events.filter((e) => e.kind === k.key).length,
  }))

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title="History"
        subtitle="Everything you've logged, in one place."
        right={
          <div className="flex gap-2" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className={`min-h-[48px] rounded-xl px-4 text-lg font-bold ${
                  range === r
                    ? 'bg-primary text-primary-contrast'
                    : 'border border-border text-text-primary'
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
        }
      />
      <ErrorNote message={error} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <div className="mb-4 flex flex-wrap gap-2" aria-label="Filter by type">
            {KIND_FILTERS.map((k) => (
              <button
                key={k.key}
                onClick={() => setFilter(k.key)}
                aria-pressed={filter === k.key}
                className={`min-h-[44px] rounded-full px-4 text-base font-semibold ${
                  filter === k.key
                    ? 'bg-primary text-primary-contrast'
                    : 'border border-border bg-surface text-text-primary'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-lg text-text-secondary">Loading your history…</p>
          ) : groups.length === 0 ? (
            <EmptyState>
              Nothing here yet for this range. Log a blood pressure reading, a meal, or a walk — it will show up here.
            </EmptyState>
          ) : (
            <div className="space-y-8">
              {groups.map((g) => (
                <section key={g.day} aria-label={g.day}>
                  <h2 className="text-lg font-bold uppercase tracking-wide text-text-secondary">
                    {g.day}
                  </h2>
                  <ul className="mt-2 space-y-2">
                    {g.items.map((e) => (
                      <li key={e.id}>
                        <Link
                          href={e.href}
                          className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:shadow"
                        >
                          <span className="text-2xl" aria-hidden="true">
                            {e.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-lg font-bold text-text-primary">{e.title}</p>
                            {e.detail && (
                              <p className="truncate text-base text-text-secondary">{e.detail}</p>
                            )}
                          </div>
                          <span className="shrink-0 text-base font-semibold text-text-secondary">
                            {timeOf(e.at)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-6" aria-label="Summary">
          <Card>
            <SectionTitle>Last {range} days</SectionTitle>
            {events.length === 0 ? (
              <p className="text-text-secondary">No activity yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {counts
                  .filter((c) => c.count > 0)
                  .map((c) => (
                    <li key={c.key} className="flex items-center justify-between text-lg">
                      <span className="text-text-primary">{c.label}</span>
                      <span className="font-bold text-text-primary">{c.count}</span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
          <Card>
            <SectionTitle>Take it to your doctor</SectionTitle>
            <p className="text-lg text-text-secondary">
              Reports turn this history into a clean summary for appointments.
            </p>
            <Link
              href="/reports"
              className="mt-3 inline-block min-h-[52px] rounded-xl bg-primary px-6 py-2 text-lg font-bold text-primary-contrast"
            >
              Build a report
            </Link>
          </Card>
        </aside>
      </div>
    </main>
  )
}
