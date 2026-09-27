'use client'

import { useMemo, useState } from 'react'

export interface TrendPoint {
  date: Date
  systolic: number | null
  diastolic: number | null
}

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Group raw readings into daily averages for the last N days. */
export function buildDailyTrend(
  readings: { measured_at: string; systolic: number; diastolic: number }[],
  days: number
): TrendPoint[] {
  const byDay = new Map<string, { sys: number[]; dia: number[]; date: Date }>()
  for (const r of readings) {
    const d = new Date(r.measured_at)
    const k = dayKey(d)
    const slot = byDay.get(k) ?? { sys: [], dia: [], date: new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
    slot.sys.push(r.systolic)
    slot.dia.push(r.diastolic)
    byDay.set(k, slot)
  }
  const out: TrendPoint[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    const slot = byDay.get(dayKey(d))
    out.push({
      date: d,
      systolic: slot ? Math.round(slot.sys.reduce((a, b) => a + b, 0) / slot.sys.length) : null,
      diastolic: slot ? Math.round(slot.dia.reduce((a, b) => a + b, 0) / slot.dia.length) : null,
    })
  }
  return out
}

const W = 640
const H = 220
const PAD = { l: 36, r: 12, t: 12, b: 28 }
const MIN_Y = 60
const MAX_Y = 190

function xFor(i: number, n: number): number {
  if (n === 1) return PAD.l + (W - PAD.l - PAD.r) / 2
  return PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r)
}
function yFor(v: number): number {
  return PAD.t + (1 - (v - MIN_Y) / (MAX_Y - MIN_Y)) * (H - PAD.t - PAD.b)
}

function linePath(points: TrendPoint[], pick: (p: TrendPoint) => number | null): string {
  const pts = points
    .map((p, i) => ({ v: pick(p), i }))
    .filter((p) => p.v !== null) as { v: number; i: number }[]
  if (pts.length === 0) return ''
  // Break the line across gaps longer than ~3 days so missing stretches don't fake a trend.
  let d = ''
  let prevI = -10
  for (const { v, i } of pts) {
    const x = xFor(i, points.length)
    const y = yFor(v)
    if (prevI < 0 || i - prevI > 3) d += `M ${x.toFixed(1)} ${y.toFixed(1)} `
    else d += `L ${x.toFixed(1)} ${y.toFixed(1)} `
    prevI = i
  }
  return d
}

/**
 * Blood pressure trend chart: daily average systolic/diastolic lines with
 * 7 / 30 / 90 day ranges. Pure SVG, theme-aware, no chart library needed.
 */
export default function BpTrendChart({
  readings,
}: {
  readings: { measured_at: string; systolic: number; diastolic: number }[]
}) {
  const [range, setRange] = useState<7 | 30 | 90>(30)
  const points = useMemo(() => buildDailyTrend(readings, range), [readings, range])

  const withData = points.filter((p) => p.systolic !== null)
  const summary = useMemo(() => {
    if (withData.length === 0) return null
    const sys = Math.round(withData.reduce((a, p) => a + (p.systolic ?? 0), 0) / withData.length)
    const dia = Math.round(withData.reduce((a, p) => a + (p.diastolic ?? 0), 0) / withData.length)
    return { sys, dia, days: withData.length }
  }, [withData])

  const gridYs = [80, 100, 120, 140, 160, 180]
  const tickEvery = range === 7 ? 1 : range === 30 ? 5 : 15

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">Trend</h2>
        <div className="flex gap-1 rounded-xl bg-[var(--surface-secondary)] p-1" role="group" aria-label="Trend range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setRange(r.days)}
              aria-pressed={range === r.days}
              className={`min-h-[44px] rounded-lg px-3 text-base font-bold ${
                range === r.days
                  ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {withData.length === 0 ? (
        <p className="mt-3 text-lg text-[var(--text-secondary)]">
          No readings in this range yet. Your trend will appear here once you log some.
        </p>
      ) : (
        <>
          {summary && (
            <p className="mt-2 text-lg text-[var(--text-secondary)]">
              Average over the last {summary.days} {summary.days === 1 ? 'day with readings' : 'days with readings'}:{' '}
              <strong className="text-[var(--text-primary)]">
                {summary.sys}/{summary.dia}
              </strong>
            </p>
          )}
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mt-3 w-full"
            role="img"
            aria-label={`Blood pressure trend, last ${range} days. Average ${summary?.sys ?? '—'} over ${summary?.dia ?? '—'}.`}
          >
            {gridYs.map((g) => (
              <g key={g}>
                <line
                  x1={PAD.l}
                  x2={W - PAD.r}
                  y1={yFor(g)}
                  y2={yFor(g)}
                  stroke="var(--border)"
                  strokeWidth="1"
                />
                <text
                  x={PAD.l - 6}
                  y={yFor(g) + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--text-secondary)"
                >
                  {g}
                </text>
              </g>
            ))}
            {/* 120 target band */}
            <rect
              x={PAD.l}
              y={yFor(130)}
              width={W - PAD.l - PAD.r}
              height={yFor(80) - yFor(130)}
              fill="var(--success)"
              opacity="0.08"
            />
            <path d={linePath(points, (p) => p.systolic)} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            <path d={linePath(points, (p) => p.diastolic)} fill="none" stroke="#0d9488" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) =>
              p.systolic !== null && (range <= 30 || i % 3 === 0) ? (
                <circle key={i} cx={xFor(i, points.length)} cy={yFor(p.systolic)} r="3" fill="var(--primary)" />
              ) : null
            )}
            {points.map((p, i) =>
              i % tickEvery === 0 ? (
                <text
                  key={`t${i}`}
                  x={xFor(i, points.length)}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--text-secondary)"
                >
                  {p.date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                </text>
              ) : null
            )}
          </svg>
          <div className="mt-2 flex gap-6 text-base text-[var(--text-secondary)]">
            <span className="flex items-center gap-2">
              <span className="inline-block h-1 w-6 rounded bg-[var(--primary)]" aria-hidden="true" />
              Top number (systolic)
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-1 w-6 rounded bg-[#0d9488]" aria-hidden="true" />
              Bottom number (diastolic)
            </span>
          </div>
        </>
      )}
    </div>
  )
}
