'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BpReading } from '@/lib/types'

const SAFETY_STORAGE_KEY = 'bp-safety-pending'

function safetyKey(userId: string | null): string {
  return userId ? `${SAFETY_STORAGE_KEY}:${userId}` : SAFETY_STORAGE_KEY
}
const AHA_MEASURE_URL =
  'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/monitoring-your-blood-pressure-at-home'

const SYMPTOMS = [
  'Chest pain or pressure',
  'Shortness of breath',
  'Numbness or weakness in your face, arm, or leg',
  'Vision changes',
  'Severe headache',
]

const FEELINGS = ['Good', 'Okay', 'Tired', 'Dizzy', 'Headache', 'Anxious']

interface SafetyPending {
  readingId: string
  systolic: number
  diastolic: number
}

interface EmergencyContact {
  id: string
  name: string
  phone: string
  relationship: string | null
}

function categoryOf(sys: number, dia: number): { label: string; classes: string } {
  if (sys >= 180 || dia >= 120)
    return { label: 'Very high', classes: 'bg-danger/10 text-danger' }
  if (sys >= 140 || dia >= 90)
    return { label: 'High', classes: 'bg-warning/10 text-warning' }
  if (sys >= 130 || dia >= 80)
    return { label: 'Slightly high', classes: 'bg-warning/10 text-warning' }
  if (sys >= 120) return { label: 'A bit elevated', classes: 'bg-warning/10 text-warning' }
  return { label: 'In a healthy range', classes: 'bg-success/10 text-success' }
}

function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const inputCls =
  'w-full min-h-[56px] rounded-xl border-2 border-border px-4 text-2xl focus:border-primary focus:outline-none'
const labelCls = 'block text-lg font-semibold text-text-primary mb-2'
const btnPrimary =
  'w-full min-h-[56px] rounded-xl bg-primary px-6 text-xl font-bold text-primary-contrast hover:bg-primary-hover disabled:opacity-50'

export default function BpPage() {
  const [readings, setReadings] = useState<BpReading[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null)

  const [systolic, setSystolic] = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [pulse, setPulse] = useState('')
  const [feeling, setFeeling] = useState('')
  const [notes, setNotes] = useState('')
  const [period, setPeriod] = useState<'morning' | 'evening'>(() =>
    new Date().getHours() < 12 ? 'morning' : 'evening'
  )
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  const [safety, setSafety] = useState<SafetyPending | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [checkedSymptoms, setCheckedSymptoms] = useState<string[]>([])
  const [safetyOutcome, setSafetyOutcome] = useState<'emergency' | 'doctor' | null>(null)
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fail = useCallback((message: string, retry: () => void) => {
    setError(message)
    setRetryAction(() => retry)
  }, [])

  const loadReadings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bp?limit=60')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'load')
      setReadings(data.readings ?? [])
    } catch {
      fail("We couldn't load your readings right now.", loadReadings)
    } finally {
      setLoading(false)
    }
  }, [fail])

  // Restore a pending safety review (it stays until completed).
  // Keyed by user so a shared device never shows one user's reading to another.
  useEffect(() => {
    const db = createClient()
    db.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null
      setUserId(uid)
      try {
        const raw = localStorage.getItem(safetyKey(uid))
        if (raw) setSafety(JSON.parse(raw) as SafetyPending)
      } catch {
        /* ignore */
      }
    })
  }, [])

  useEffect(() => {
    loadReadings()
    const db = createClient()
    db.from('emergency_contacts')
      .select('id, name, phone, relationship')
      .eq('active', true)
      .then(({ data }) => {
        if (data) setEmergencyContacts(data as EmergencyContact[])
      })
  }, [loadReadings])

  async function handleSave() {
    setFormError(null)
    setSavedNote(null)
    const sys = parseInt(systolic.trim(), 10)
    const dia = parseInt(diastolic.trim(), 10)
    if (!/^\d+$/.test(systolic.trim()) || !/^\d+$/.test(diastolic.trim())) {
      setFormError("Enter two whole numbers, like 120 over 80.")
      return
    }
    if (sys < 40 || sys > 300 || dia < 30 || dia > 200) {
      setFormError("That doesn't look right. The top number is usually 40–300 and the bottom 30–200.")
      return
    }
    if (sys <= dia) {
      setFormError('The top number should be higher than the bottom number.')
      return
    }
    const pulseVal = pulse.trim() === '' ? null : parseInt(pulse.trim(), 10)
    if (pulseVal !== null && (!/^\d+$/.test(pulse.trim()) || pulseVal < 30 || pulseVal > 250)) {
      setFormError('Pulse should be a whole number between 30 and 250, or left blank.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/bp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systolic: sys,
          diastolic: dia,
          pulse: pulseVal,
          period,
          feeling: feeling || undefined,
          notes: notes || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'save')
      if (data.duplicate) {
        setSavedNote('You already saved this reading — no need to enter it twice.')
      } else {
        setSavedNote('Reading saved.')
      }
      setSystolic('')
      setDiastolic('')
      setPulse('')
      setFeeling('')
      setNotes('')
      if (data.safety && data.reading) {
        const pending: SafetyPending = {
          readingId: data.reading.id,
          systolic: data.reading.systolic,
          diastolic: data.reading.diastolic,
        }
        setSafety(pending)
        setSafetyOutcome(null)
        setCheckedSymptoms([])
        try {
          localStorage.setItem(safetyKey(userId), JSON.stringify(pending))
        } catch {
          /* ignore */
        }
      }
      loadReadings()
    } catch (e) {
      fail(e instanceof Error && e.message !== 'save' ? e.message : "We couldn't save that reading.", handleSave)
    } finally {
      setSaving(false)
    }
  }

  function toggleSymptom(s: string) {
    setCheckedSymptoms((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    )
  }

  async function completeSafetyReview(outcome: 'emergency' | 'doctor') {
    setSafetyOutcome(outcome)
    try {
      const db = createClient()
      await db.from('audit_events').insert({
        action: 'safety_review_completed',
        details: {
          reading_id: safety?.readingId,
          symptoms: checkedSymptoms,
          outcome,
        },
      })
    } catch {
      /* best effort */
    }
    try {
      localStorage.removeItem(safetyKey(userId))
    } catch {
      /* ignore */
    }
  }

  async function handleDelete(id: string) {
    if (deletingId !== id) {
      setDeletingId(id)
      return
    }
    setDeletingId(null)
    try {
      const res = await fetch(`/api/bp/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'delete')
      setReadings((prev) => prev.filter((r) => r.id !== id))
    } catch {
      fail("We couldn't delete that reading.", () => handleDelete(id))
    }
  }

  // Weekly trend: average per day for the last 7 days.
  const weekDays = (() => {
    const days: { key: string; label: string; sys: number | null; dia: number | null; count: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = localDateKey(d)
      const todays = readings.filter((r) => localDateKey(new Date(r.measured_at)) === key)
      days.push({
        key,
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        sys: todays.length ? Math.round(todays.reduce((a, r) => a + r.systolic, 0) / todays.length) : null,
        dia: todays.length ? Math.round(todays.reduce((a, r) => a + r.diastolic, 0) / todays.length) : null,
        count: todays.length,
      })
    }
    return days
  })()
  const maxBar = Math.max(160, ...weekDays.flatMap((d) => [d.sys ?? 0, d.dia ?? 0]))

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Blood Pressure</h1>
        <p className="mt-1 text-lg text-text-secondary">Log your readings and see how you&apos;re doing.</p>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-danger/30 bg-danger/10 p-4" role="alert">
          <p className="text-lg font-semibold text-danger">{error}</p>
          {retryAction && (
            <button
              onClick={() => {
                setError(null)
                retryAction()
              }}
              className="mt-3 min-h-[48px] rounded-xl bg-danger px-6 text-lg font-bold text-white hover:bg-danger"
            >
              Try Again
            </button>
          )}
        </div>
      )}

      {/* Log reading form */}
      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm" aria-labelledby="log-heading">
        <h2 id="log-heading" className="text-2xl font-bold text-text-primary">Log a reading</h2>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls} htmlFor="sys">Top number (systolic)</label>
            <input
              id="sys"
              inputMode="numeric"
              autoComplete="off"
              className={inputCls}
              placeholder="120"
              value={systolic}
              onChange={(e) => setSystolic(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="dia">Bottom number (diastolic)</label>
            <input
              id="dia"
              inputMode="numeric"
              autoComplete="off"
              className={inputCls}
              placeholder="80"
              value={diastolic}
              onChange={(e) => setDiastolic(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className={labelCls} htmlFor="pulse">Pulse (optional)</label>
          <input
            id="pulse"
            inputMode="numeric"
            autoComplete="off"
            className={inputCls}
            placeholder="72"
            value={pulse}
            onChange={(e) => setPulse(e.target.value)}
          />
        </div>

        <div className="mt-4">
          <span className={labelCls} id="period-label">Time of day</span>
          <div className="grid grid-cols-2 gap-3" role="group" aria-labelledby="period-label">
            {(['morning', 'evening'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                aria-pressed={period === p}
                className={`min-h-[56px] rounded-xl border-2 text-xl font-bold capitalize ${
                  period === p
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface text-text-primary'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="mt-1 text-base text-text-secondary">
            We guessed {period} from the time — tap to change it.
          </p>
        </div>

        <div className="mt-4">
          <label className={labelCls} htmlFor="feeling">How are you feeling? (optional)</label>
          <select
            id="feeling"
            className={inputCls}
            value={feeling}
            onChange={(e) => setFeeling(e.target.value)}
          >
            <option value="">—</option>
            {FEELINGS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label className={labelCls} htmlFor="notes">Notes (optional)</label>
          <textarea
            id="notes"
            rows={2}
            className="w-full min-h-[56px] rounded-xl border-2 border-border px-4 py-3 text-xl focus:border-primary focus:outline-none"
            placeholder="Anything worth remembering…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {formError && (
          <p className="mt-3 text-lg font-semibold text-danger" role="alert">{formError}</p>
        )}
        {savedNote && (
          <p className="mt-3 text-lg font-semibold text-success" role="status">{savedNote}</p>
        )}

        <button onClick={handleSave} disabled={saving} className={`${btnPrimary} mt-5`}>
          {saving ? 'Saving…' : 'Save reading'}
        </button>
      </section>

      {/* Measurement guide */}
      <section className="rounded-2xl border border-border bg-primary/10 p-6" aria-labelledby="guide-heading">
        <h2 id="guide-heading" className="text-2xl font-bold text-text-primary">How to measure well</h2>
        <ul className="mt-3 space-y-2 text-lg text-text-primary list-disc pl-6">
          <li>Sit down and rest quietly for 5 minutes first.</li>
          <li>Sit with your back supported and feet flat on the floor.</li>
          <li>Rest your arm on a table so the cuff is at heart level.</li>
          <li>Don&apos;t talk during the measurement.</li>
        </ul>
        <details className="mt-3">
          <summary className="cursor-pointer text-lg font-semibold text-primary underline">
            Why do these steps matter?
          </summary>
          <p className="mt-2 text-lg text-text-primary">
            Measuring the wrong way can give a falsely high reading. The American Heart
            Association recommends resting 5 minutes, sitting with back supported and
            feet flat, and keeping your arm at heart level.{' '}
            <a
              href={AHA_MEASURE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary underline"
            >
              Read the AHA guide
            </a>
          </p>
        </details>
      </section>

      {/* Weekly trend */}
      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm" aria-labelledby="trend-heading">
        <h2 id="trend-heading" className="text-2xl font-bold text-text-primary">This week</h2>
        {weekDays.every((d) => d.count === 0) ? (
          <p className="mt-3 text-lg text-text-secondary">No readings this week yet. Your trend will appear here.</p>
        ) : (
          <div className="mt-4">
            <div className="flex items-end justify-between gap-2 h-44" role="img" aria-label="Weekly blood pressure trend">
              {weekDays.map((d) => (
                <div key={d.key} className="flex flex-1 flex-col items-center justify-end gap-1">
                  {d.sys !== null ? (
                    <div className="flex w-full items-end justify-center gap-1">
                      <div className="flex flex-col items-center justify-end">
                        <span className="text-xs font-bold text-primary">{d.sys}</span>
                        <div
                          className="w-6 rounded-t bg-primary"
                          style={{ height: `${Math.max(6, (d.sys / maxBar) * 140)}px` }}
                        />
                      </div>
                      <div className="flex flex-col items-center justify-end">
                        <span className="text-xs font-bold text-teal-900">{d.dia}</span>
                        <div
                          className="w-6 rounded-t bg-teal-500"
                          style={{ height: `${Math.max(6, ((d.dia ?? 0) / maxBar) * 140)}px` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-text-secondary">—</span>
                  )}
                  <span className="text-sm font-semibold text-text-secondary">{d.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-6 text-base text-text-secondary">
              <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded bg-primary" /> Top number</span>
              <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded bg-teal-500" /> Bottom number</span>
            </div>
          </div>
        )}
      </section>

      {/* History */}
      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-2xl font-bold text-text-primary">Your readings</h2>
        {loading ? (
          <p className="mt-3 text-lg text-text-secondary">Loading…</p>
        ) : readings.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-border bg-surface p-6 text-center">
            <p className="text-lg text-text-secondary">No readings yet. Your history will show up here.</p>
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {readings.map((r) => {
              const cat = categoryOf(r.systolic, r.diastolic)
              return (
                <li key={r.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-2xl font-bold text-text-primary">
                        {r.systolic}/{r.diastolic}
                        {r.pulse !== null && (
                          <span className="ml-2 text-lg font-normal text-text-secondary">♥ {r.pulse}</span>
                        )}
                      </p>
                      <p className="mt-1 text-base text-text-secondary">
                        {formatWhen(r.measured_at)} · {r.period === 'morning' ? 'Morning' : 'Evening'}
                        {r.feeling ? ` · ${r.feeling}` : ''}
                      </p>
                      {r.notes && <p className="mt-1 text-base text-text-secondary">{r.notes}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`rounded-full px-3 py-1 text-sm font-bold ${cat.classes}`}>{cat.label}</span>
                      <span className="rounded-full bg-surface-secondary px-3 py-1 text-sm font-semibold text-text-secondary">
                        {r.source}
                      </span>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="min-h-[44px] rounded-lg px-3 text-base font-semibold text-danger underline"
                      >
                        {deletingId === r.id ? 'Tap again to delete' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Safety modal — stays until the review is completed */}
      {safety && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="safety-title">
          <div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl">
            {safetyOutcome === null ? (
              <>
                <h2 id="safety-title" className="text-2xl font-bold text-danger">
                  Your reading is very high: {safety.systolic}/{safety.diastolic}
                </h2>
                <p className="mt-2 text-lg text-text-primary">
                  Do you have <strong>any</strong> of these symptoms right now? Check all that apply:
                </p>
                <div className="mt-4 space-y-2">
                  {SYMPTOMS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSymptom(s)}
                      aria-pressed={checkedSymptoms.includes(s)}
                      className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border-2 px-4 text-left text-lg font-semibold ${
                        checkedSymptoms.includes(s)
                          ? 'border-danger bg-danger/10 text-danger'
                          : 'border-border bg-surface text-text-primary'
                      }`}
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 ${
                        checkedSymptoms.includes(s) ? 'border-danger bg-danger text-white' : 'border-border'
                      }`} aria-hidden="true">
                        {checkedSymptoms.includes(s) ? '✓' : ''}
                      </span>
                      {s}
                    </button>
                  ))}
                </div>
                <div className="mt-5 space-y-3">
                  <button
                    onClick={() => completeSafetyReview('emergency')}
                    disabled={checkedSymptoms.length === 0}
                    className="min-h-[56px] w-full rounded-xl bg-danger px-6 text-xl font-bold text-white hover:bg-danger disabled:opacity-40"
                  >
                    I have one or more of these
                  </button>
                  <button
                    onClick={() => completeSafetyReview('doctor')}
                    className="min-h-[56px] w-full rounded-xl border-2 border-border px-6 text-xl font-bold text-text-primary hover:bg-surface-secondary"
                  >
                    None of these — I&apos;m okay
                  </button>
                </div>
                <p className="mt-3 text-base text-text-secondary">
                  This check stays here until you answer — it won&apos;t go away on its own.
                </p>
              </>
            ) : safetyOutcome === 'emergency' ? (
              <>
                <h2 id="safety-title" className="text-2xl font-bold text-danger">Call emergency services now</h2>
                <p className="mt-2 text-lg text-text-primary">
                  A very high reading with symptoms needs urgent care. <strong>Call 911</strong> (or your local emergency number) right away.
                </p>
                {emergencyContacts.length > 0 && (
                  <div className="mt-4">
                    <p className="text-lg font-semibold text-text-primary">Your emergency contacts:</p>
                    <ul className="mt-2 space-y-2">
                      {emergencyContacts.map((c) => (
                        <li key={c.id} className="flex items-center justify-between rounded-xl bg-surface-secondary p-3">
                          <span className="text-lg font-semibold text-text-primary">
                            {c.name}{c.relationship ? ` (${c.relationship})` : ''}
                          </span>
                          <a href={`tel:${c.phone}`} className="min-h-[48px] rounded-xl bg-primary px-4 py-2 text-lg font-bold text-primary-contrast">
                            Call
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  onClick={() => setSafety(null)}
                  className="mt-5 min-h-[56px] w-full rounded-xl bg-[var(--text-primary)] px-6 text-xl font-bold text-[var(--background)]"
                >
                  I understand
                </button>
              </>
            ) : (
              <>
                <h2 id="safety-title" className="text-2xl font-bold text-warning">Contact your doctor promptly</h2>
                <p className="mt-2 text-lg text-text-primary">
                  Your reading of {safety.systolic}/{safety.diastolic} is very high. Since you have no warning symptoms, call your doctor&apos;s office today for advice. If symptoms appear later, call 911.
                </p>
                <p className="mt-2 text-lg text-text-primary">This reading has been saved in your history.</p>
                <button
                  onClick={() => setSafety(null)}
                  className="mt-5 min-h-[56px] w-full rounded-xl bg-[var(--text-primary)] px-6 text-xl font-bold text-[var(--background)]"
                >
                  I understand
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
