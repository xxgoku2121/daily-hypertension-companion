'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { BpReading } from '@/lib/types'
import PhotoCapture from '@/components/PhotoCapture'
import BpTrendChart from '@/components/BpTrendChart'

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

interface PhotoResult {
  systolic: number | null
  diastolic: number | null
  pulse: number | null
  confidence: string
  notes: string
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
  'w-full min-h-[56px] rounded-xl border-2 border-border bg-surface px-4 text-2xl text-text-primary focus:border-primary focus:outline-none'
const labelCls = 'block text-lg font-semibold text-text-primary mb-2'
const btnPrimary =
  'w-full min-h-[56px] rounded-xl bg-primary px-6 text-xl font-bold text-primary-contrast hover:bg-primary-hover disabled:opacity-50'

export default function BpPage() {
  const [readings, setReadings] = useState<BpReading[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null)

  // entry state
  const [entryTab, setEntryTab] = useState<'manual' | 'photo'>('manual')
  const [systolic, setSystolic] = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [pulse, setPulse] = useState('')
  const [feeling, setFeeling] = useState('')
  const [notes, setNotes] = useState('')
  const [showDetails, setShowDetails] = useState(false)
  const [period, setPeriod] = useState<'morning' | 'evening'>(() =>
    new Date().getHours() < 12 ? 'morning' : 'evening'
  )
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  // photo flow
  const [photoResult, setPhotoResult] = useState<PhotoResult | null>(null)
  const [photoSys, setPhotoSys] = useState('')
  const [photoDia, setPhotoDia] = useState('')
  const [photoPulse, setPhotoPulse] = useState('')

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
      const res = await fetch('/api/bp?limit=90')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'load')
      const list: BpReading[] = data.readings ?? []
      list.sort((a, b) => +new Date(b.measured_at) - +new Date(a.measured_at))
      setReadings(list)
    } catch {
      fail("We couldn't load your readings right now.", loadReadings)
    } finally {
      setLoading(false)
    }
  }, [fail])

  // Restore a pending safety review (it stays until completed).
  useEffect(() => {
    const db = createClient()
    db.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    try {
      const raw = localStorage.getItem(safetyKey(null))
      if (raw) {
        const pending = JSON.parse(raw) as SafetyPending
        setSafety(pending)
        setSafetyOutcome(null)
        setCheckedSymptoms([])
      }
    } catch {
      /* ignore */
    }
    loadReadings()
    // emergency contacts for the safety flow
    db.from('emergency_contacts')
      .select('id,name,phone,relationship')
      .then(({ data }) => {
        if (Array.isArray(data)) setEmergencyContacts(data as EmergencyContact[])
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveReading(
    sys: number,
    dia: number,
    pulseVal: number | null,
    src: 'manual' | 'photo'
  ): Promise<boolean> {
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
          source: src,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'save')
      if (data.duplicate) {
        setSavedNote('You already saved this reading — no need to enter it twice.')
      } else {
        setSavedNote('Reading saved. Nice work.')
      }
      setSystolic('')
      setDiastolic('')
      setPulse('')
      setFeeling('')
      setNotes('')
      setPhotoResult(null)
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
      return true
    } catch (e) {
      setFormError(
        e instanceof Error && e.message !== 'save'
          ? e.message
          : "We couldn't save that reading."
      )
      return false
    } finally {
      setSaving(false)
    }
  }

  function parseManual(): { sys: number; dia: number; pulseVal: number | null } | null {
    const sys = parseInt(systolic.trim(), 10)
    const dia = parseInt(diastolic.trim(), 10)
    if (!/^\d+$/.test(systolic.trim()) || !/^\d+$/.test(diastolic.trim())) {
      setFormError('Enter two whole numbers, like 120 over 80.')
      return null
    }
    if (sys < 40 || sys > 300 || dia < 30 || dia > 200) {
      setFormError("That doesn't look right. The top number is usually 40–300 and the bottom 30–200.")
      return null
    }
    if (sys <= dia) {
      setFormError('The top number should be higher than the bottom number.')
      return null
    }
    const pulseVal = pulse.trim() === '' ? null : parseInt(pulse.trim(), 10)
    if (pulseVal !== null && (!/^\d+$/.test(pulse.trim()) || pulseVal < 30 || pulseVal > 250)) {
      setFormError('Pulse should be a whole number between 30 and 250, or left blank.')
      return null
    }
    return { sys, dia, pulseVal }
  }

  async function handleSaveManual() {
    setFormError(null)
    setSavedNote(null)
    const parsed = parseManual()
    if (!parsed) return
    await saveReading(parsed.sys, parsed.dia, parsed.pulseVal, 'manual')
  }

  function handlePhotoExtracted(data: Record<string, unknown>) {
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null
    const result: PhotoResult = {
      systolic: num(data.systolic),
      diastolic: num(data.diastolic),
      pulse: num(data.pulse),
      confidence: typeof data.confidence === 'string' ? data.confidence : 'low',
      notes: typeof data.notes === 'string' ? data.notes : '',
    }
    setPhotoResult(result)
    setPhotoSys(result.systolic !== null ? String(result.systolic) : '')
    setPhotoDia(result.diastolic !== null ? String(result.diastolic) : '')
    setPhotoPulse(result.pulse !== null ? String(result.pulse) : '')
    setFormError(null)
  }

  async function handleConfirmPhoto() {
    setFormError(null)
    const sys = parseInt(photoSys.trim(), 10)
    const dia = parseInt(photoDia.trim(), 10)
    if (!/^\d+$/.test(photoSys.trim()) || !/^\d+$/.test(photoDia.trim()) || sys <= dia) {
      setFormError('Please check the two numbers — the top one should be higher.')
      return
    }
    const pulseVal = photoPulse.trim() === '' ? null : parseInt(photoPulse.trim(), 10)
    await saveReading(sys, dia, pulseVal, 'photo')
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

  const latest = readings[0] ?? null

  const todayStatus = useMemo(() => {
    const key = localDateKey(new Date())
    const todays = readings.filter((r) => localDateKey(new Date(r.measured_at)) === key)
    return {
      morning: todays.some((r) => r.period === 'morning'),
      evening: todays.some((r) => r.period === 'evening'),
    }
  }, [readings])

  const isEmpty = !loading && readings.length === 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Blood Pressure</h1>
        <p className="mt-1 text-lg text-text-secondary">
          {isEmpty
            ? 'Your blood pressure story starts with one reading.'
            : 'Log your readings and see how you\u2019re doing.'}
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border-2 border-danger/30 bg-danger/10 p-4" role="alert">
          <p className="text-lg font-semibold text-danger">{error}</p>
          {retryAction && (
            <button
              onClick={() => {
                setError(null)
                retryAction()
              }}
              className="mt-3 min-h-[48px] rounded-xl bg-danger px-6 text-lg font-bold text-on-danger hover:bg-danger"
            >
              Try Again
            </button>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* MAIN COLUMN */}
        <div className="space-y-6">
          {/* Entry */}
          <section
            className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
            aria-labelledby="log-heading"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="log-heading" className="text-2xl font-bold text-text-primary">
                Log a reading
              </h2>
              <div
                className="flex gap-1 rounded-xl bg-surface-secondary p-1"
                role="group"
                aria-label="Entry method"
              >
                {(
                  [
                    { id: 'manual', label: '✏️ Write it' },
                    { id: 'photo', label: '📷 Photo' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setEntryTab(t.id)
                      setFormError(null)
                    }}
                    aria-pressed={entryTab === t.id}
                    className={`min-h-[48px] whitespace-nowrap rounded-lg px-4 text-lg font-bold ${
                      entryTab === t.id
                        ? 'bg-surface text-primary shadow-sm'
                        : 'text-text-secondary'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {entryTab === 'photo' ? (
              <div className="mt-4">
                {!photoResult ? (
                  <PhotoCapture kind="bp" onExtracted={handlePhotoExtracted} />
                ) : (
                  <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-5">
                    <h3 className="text-xl font-bold text-text-primary">
                      I found{' '}
                      {photoResult.systolic !== null && photoResult.diastolic !== null ? (
                        <>
                          {photoResult.systolic} / {photoResult.diastolic}
                          {photoResult.pulse !== null && `, pulse ${photoResult.pulse}`}
                        </>
                      ) : (
                        'a reading, but some numbers were unclear'
                      )}
                      .
                    </h3>
                    {photoResult.confidence === 'low' && (
                      <p className="mt-1 text-base text-warning">
                        I&apos;m not fully sure about these numbers — please check them below.
                      </p>
                    )}
                    {photoResult.notes && (
                      <p className="mt-1 text-base text-text-secondary">{photoResult.notes}</p>
                    )}
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls} htmlFor="photo-sys">Top</label>
                        <input
                          id="photo-sys"
                          inputMode="numeric"
                          className={inputCls}
                          value={photoSys}
                          onChange={(e) => setPhotoSys(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor="photo-dia">Bottom</label>
                        <input
                          id="photo-dia"
                          inputMode="numeric"
                          className={inputCls}
                          value={photoDia}
                          onChange={(e) => setPhotoDia(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor="photo-pulse">Pulse</label>
                        <input
                          id="photo-pulse"
                          inputMode="numeric"
                          className={inputCls}
                          value={photoPulse}
                          onChange={(e) => setPhotoPulse(e.target.value)}
                        />
                      </div>
                    </div>
                    {formError && (
                      <p className="mt-3 text-lg font-semibold text-danger" role="alert">
                        {formError}
                      </p>
                    )}
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setPhotoResult(null)}
                        className="min-h-[56px] rounded-xl border-2 border-border text-xl font-bold text-text-primary"
                      >
                        Retake
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmPhoto}
                        disabled={saving}
                        className="min-h-[56px] rounded-xl bg-primary text-xl font-bold text-primary-contrast hover:bg-primary-hover disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : '✓ Confirm & save'}
                      </button>
                    </div>
                    <p className="mt-2 text-center text-base text-text-secondary">
                      Nothing is saved until you confirm.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls} htmlFor="sys">Top number</label>
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
                    <label className={labelCls} htmlFor="dia">Bottom number</label>
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

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls} htmlFor="pulse">Pulse <span className="font-normal text-text-secondary">(optional)</span></label>
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
                  <div className="col-span-2 xl:col-span-1">
                    <span className={labelCls} id="period-label">Time of day</span>
                    <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="period-label">
                      {(['morning', 'evening'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPeriod(p)}
                          aria-pressed={period === p}
                          className={`min-h-[56px] rounded-xl border-2 text-lg font-bold capitalize ${
                            period === p
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-surface text-text-primary'
                          }`}
                        >
                          {p === 'morning' ? '🌅' : '🌙'} {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  aria-expanded={showDetails}
                  className="mt-4 min-h-[44px] text-lg font-semibold text-primary underline"
                >
                  {showDetails ? 'Hide extra details' : '+ More details (optional)'}
                </button>
                {showDetails && (
                  <div className="mt-2 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelCls} htmlFor="feeling">How are you feeling?</label>
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
                    <div>
                      <label className={labelCls} htmlFor="notes">Notes</label>
                      <input
                        id="notes"
                        className={inputCls}
                        placeholder="Anything worth remembering…"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {formError && (
                  <p className="mt-3 text-lg font-semibold text-danger" role="alert">{formError}</p>
                )}
                {savedNote && (
                  <p className="mt-3 text-lg font-semibold text-success" role="status">{savedNote}</p>
                )}

                <button onClick={handleSaveManual} disabled={saving} className={`${btnPrimary} mt-5`}>
                  {saving ? 'Saving…' : 'Save reading'}
                </button>
              </div>
            )}
          </section>

          {/* Trend */}
          {!isEmpty && (
            <section
              className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
              aria-labelledby="trend-heading"
            >
              <BpTrendChart
                readings={readings.map((r) => ({
                  measured_at: r.measured_at,
                  systolic: r.systolic,
                  diastolic: r.diastolic,
                }))}
              />
            </section>
          )}

          {/* History */}
          <section aria-labelledby="history-heading">
            <div className="flex items-baseline justify-between">
              <h2 id="history-heading" className="text-2xl font-bold text-text-primary">
                Recent readings
              </h2>
              <Link href="/history" className="text-lg font-semibold text-primary underline">
                Full history
              </Link>
            </div>
            {loading ? (
              <p className="mt-3 text-lg text-text-secondary">Loading…</p>
            ) : readings.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
                <p className="text-4xl" aria-hidden="true">💓</p>
                <p className="mt-2 text-xl font-bold text-text-primary">No readings yet</p>
                <p className="mt-1 text-lg text-text-secondary">
                  Log your first reading above — it takes less than a minute, and your
                  trend starts here.
                </p>
              </div>
            ) : (
              <ul className="mt-3 space-y-3">
                {readings.slice(0, 8).map((r) => {
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
                            {r.source === 'photo' ? ' · 📷' : ''}
                            {r.feeling ? ` · ${r.feeling}` : ''}
                          </p>
                          {r.notes && <p className="mt-1 text-base text-text-secondary">{r.notes}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`rounded-full px-3 py-1 text-sm font-bold ${cat.classes}`}>{cat.label}</span>
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
        </div>

        {/* RIGHT COLUMN */}
        <aside className="space-y-6">
          {latest && (
            <section
              className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
              aria-labelledby="latest-heading"
            >
              <h2 id="latest-heading" className="text-lg font-bold uppercase tracking-wide text-text-secondary">
                Latest reading
              </h2>
              <p className="mt-2 text-5xl font-extrabold text-text-primary">
                {latest.systolic}
                <span className="text-text-secondary">/</span>
                {latest.diastolic}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${categoryOf(latest.systolic, latest.diastolic).classes}`}>
                  {categoryOf(latest.systolic, latest.diastolic).label}
                </span>
                {latest.pulse !== null && (
                  <span className="text-lg text-text-secondary">♥ {latest.pulse} bpm</span>
                )}
              </div>
              <p className="mt-2 text-base text-text-secondary">{formatWhen(latest.measured_at)}</p>
            </section>
          )}

          <section
            className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
            aria-labelledby="routine-heading"
          >
            <h2 id="routine-heading" className="text-lg font-bold uppercase tracking-wide text-text-secondary">
              Today&apos;s routine
            </h2>
            <ul className="mt-3 space-y-3">
              {(
                [
                  { label: 'Morning reading', done: todayStatus.morning, icon: '🌅' },
                  { label: 'Evening reading', done: todayStatus.evening, icon: '🌙' },
                ] as const
              ).map((row) => (
                <li key={row.label} className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${
                      row.done ? 'bg-success/15 text-success' : 'bg-surface-secondary text-text-secondary'
                    }`}
                    aria-hidden="true"
                  >
                    {row.done ? '✓' : row.icon}
                  </span>
                  <span className={`text-lg ${row.done ? 'text-text-secondary line-through' : 'font-semibold text-text-primary'}`}>
                    {row.label}
                  </span>
                </li>
              ))}
            </ul>
            {!todayStatus.morning && !todayStatus.evening && !isEmpty && (
              <p className="mt-3 text-base text-text-secondary">
                No readings today yet — one quick check keeps your trend honest.
              </p>
            )}
          </section>

          <section
            className="rounded-2xl border border-primary/20 bg-primary/5 p-6"
            aria-labelledby="tips-heading"
          >
            <h2 id="tips-heading" className="text-xl font-bold text-text-primary">
              Measure it right
            </h2>
            <ul className="mt-3 space-y-2 text-base text-text-primary list-disc pl-5">
              <li>Rest quietly for 5 minutes first.</li>
              <li>Back supported, feet flat on the floor.</li>
              <li>Cuff at heart level, arm resting on a table.</li>
              <li>Don&apos;t talk during the measurement.</li>
            </ul>
            <details className="mt-3">
              <summary className="cursor-pointer text-base font-semibold text-primary underline">
                Why do these steps matter?
              </summary>
              <p className="mt-2 text-base text-text-primary">
                Measuring the wrong way can give a falsely high reading. The American Heart
                Association recommends resting 5 minutes with your arm at heart level.{' '}
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

          <Link
            href="/guide"
            className="block rounded-2xl border border-border bg-surface p-6 shadow-sm transition hover:shadow"
          >
            <p className="text-xl font-bold text-text-primary">💬 Ask about my readings</p>
            <p className="mt-1 text-base text-text-secondary">
              The Health Guide knows your recent numbers and can explain what they mean.
            </p>
          </Link>
        </aside>
      </div>

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
                        checkedSymptoms.includes(s) ? 'border-danger bg-danger text-on-danger' : 'border-border'
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
                    className="min-h-[56px] w-full rounded-xl bg-danger px-6 text-xl font-bold text-on-danger hover:bg-danger disabled:opacity-40"
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
