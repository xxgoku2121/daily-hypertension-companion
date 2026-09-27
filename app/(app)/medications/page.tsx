'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { Medication, MedicationLog } from '@/lib/types'
import { Modal } from '@/components/ui'
import PhotoCapture from '@/components/PhotoCapture'

const INSTRUCTION_SOURCE_OPTIONS = [
  { value: 'prescription', label: 'Prescription (most reliable)' },
  { value: 'clinician', label: 'My doctor or clinician' },
  { value: 'pharmacist', label: 'My pharmacist' },
  { value: 'user', label: 'My own note' },
] as const

const FREQUENCIES = ['Daily', 'Twice daily', 'Three times daily', 'Weekly', 'As needed']

// The DB schema carries as_needed; the shared type does not yet.
interface MedicationRow extends Medication {
  as_needed: boolean | null
}

function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatTime(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return hhmm
  const h = parseInt(m[1], 10)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${suffix}`
}

/** Refill count, stated plainly. `refills_remaining` is the number of
 *  prescription refills left on the pharmacy label — not pills — so we
 *  never convert it into "days of supply". */
function refillEstimate(med: MedicationRow): string | null {
  if (med.refills_remaining === null || med.refills_remaining === undefined)
    return null
  const n = Number(med.refills_remaining)
  if (!Number.isFinite(n)) return null
  return `${n} refill${n === 1 ? '' : 's'} left on the prescription.`
}

function statusBadge(status: string): { label: string; classes: string } {
  switch (status) {
    case 'taken':
      return { label: 'Taken ✓', classes: 'bg-success/10 text-success' }
    case 'skipped':
      return { label: 'Skipped', classes: 'bg-surface-secondary text-text-primary' }
    case 'snoozed':
      return { label: 'Not yet', classes: 'bg-warning/10 text-warning' }
    default:
      return { label: 'Pending', classes: 'bg-primary/10 text-primary' }
  }
}

/** Card badge for a medicine: per-dose progress for multi-dose schedules
 *  ("1 of 2 taken"), otherwise the latest log status. */
function doseBadge(
  med: { as_needed: boolean | null; frequency: string | null },
  takenCount: number,
  latestStatus: string | null,
): { label: string; classes: string } {
  if (!med.as_needed) {
    const expected = dosesPerDay(med.frequency)
    if (expected > 1) {
      if (takenCount >= expected)
        return { label: 'Taken ✓', classes: 'bg-success/10 text-success' }
      if (takenCount > 0)
        return {
          label: `${takenCount} of ${expected} taken`,
          classes: 'bg-warning/10 text-warning',
        }
    }
  }
  return statusBadge(latestStatus ?? 'pending')
}

const inputCls =
  'w-full min-h-[56px] rounded-xl border-2 border-border bg-surface px-4 text-xl text-text-primary focus:border-primary focus:outline-none'
const labelCls = 'block text-lg font-semibold text-text-primary mb-2'

interface MedForm {
  name: string
  dose: string
  frequency: string
  time: string
  as_needed: boolean
  instructions: string
  instruction_source: string
  prescriber: string
  pharmacy: string
  pharmacy_phone: string
  refill_date: string
  refills_remaining: string
}

const emptyForm: MedForm = {
  name: '',
  dose: '',
  frequency: 'Daily',
  time: '08:00',
  as_needed: false,
  instructions: '',
  instruction_source: 'prescription',
  prescriber: '',
  pharmacy: '',
  pharmacy_phone: '',
  refill_date: '',
  refills_remaining: '',
}

/** Expected doses per day, derived from the frequency text the person entered.
 *  Defaults to 1 when the frequency is unknown — never guesses more. */
function dosesPerDay(frequency: string | null | undefined): number {
  const freq = (frequency || '').toLowerCase()
  if (freq.includes('twice')) return 2
  if (freq.includes('three')) return 3
  return 1
}

/** 7-day adherence strip: share of scheduled doses taken each day. */
function AdherenceCard({
  meds,
  weekLogs,
}: {
  meds: MedicationRow[]
  weekLogs: Record<string, MedicationLog[]>
}) {
  const scheduled = meds.filter((m) => !m.as_needed)
  if (scheduled.length === 0) return null
  const dosesByMed = new Map(scheduled.map((m) => [m.id, dosesPerDay(m.frequency)]))
  const days: { key: string; label: string; taken: number; total: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = localDateKey(d)
    const logs = weekLogs[key] ?? []
    const takenByMed = new Map<string, number>()
    for (const l of logs) {
      if (l.status !== 'taken' || !dosesByMed.has(l.medication_id)) continue
      takenByMed.set(l.medication_id, (takenByMed.get(l.medication_id) ?? 0) + 1)
    }
    // Each medicine counts toward at most its expected daily doses.
    let taken = 0
    let total = 0
    for (const [id, expected] of dosesByMed) {
      total += expected
      taken += Math.min(takenByMed.get(id) ?? 0, expected)
    }
    days.push({
      key,
      label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      taken,
      total,
    })
  }
  const fullDays = days.filter((d) => d.taken >= d.total && d.total > 0).length
  return (
    <section
      className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
      aria-labelledby="adherence-heading"
    >
      <h2 id="adherence-heading" className="text-lg font-bold uppercase tracking-wide text-text-secondary">
        This week
      </h2>
      <p className="mt-2 text-lg text-text-primary">
        <strong>{fullDays} of 7 days</strong> fully taken
      </p>
      <div className="mt-3 flex items-end justify-between gap-1" role="img" aria-label={`Medication adherence: ${fullDays} of 7 days fully taken`}>
        {days.map((d) => {
          const pct = d.total === 0 ? 0 : d.taken / d.total
          return (
            <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`w-full rounded-t-md ${pct >= 1 ? 'bg-success' : pct > 0 ? 'bg-warning' : 'bg-surface-secondary'}`}
                style={{ height: `${Math.max(8, pct * 64)}px` }}
                title={`${d.taken} of ${d.total} taken`}
              />
              <span className="text-sm font-semibold text-text-secondary">{d.label}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Refill summary — only for medicines that track refills. */
function RefillCard({
  meds,
  onEdit,
}: {
  meds: MedicationRow[]
  onEdit: (med: MedicationRow) => void
}) {
  const tracked = meds.filter(
    (m) => m.refills_remaining !== null && m.refills_remaining !== undefined
  )
  if (tracked.length === 0) return null
  return (
    <section
      className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
      aria-labelledby="refill-heading"
    >
      <h2 id="refill-heading" className="text-lg font-bold uppercase tracking-wide text-text-secondary">
        Refills
      </h2>
      <ul className="mt-3 space-y-3">
        {tracked.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-text-primary">{m.name}</p>
              <p className="text-base text-text-secondary">{refillEstimate(m)}</p>
            </div>
            <button
              onClick={() => onEdit(m)}
              className="min-h-[44px] shrink-0 px-2 text-base font-semibold text-primary underline"
            >
              Update
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Pharmacy quick-call — shown when any medicine has pharmacy info. */
function PharmacyCard({ meds }: { meds: MedicationRow[] }) {
  const med = meds.find((m) => m.pharmacy || m.pharmacy_phone)
  if (!med) return null
  return (
    <section
      className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
      aria-labelledby="pharmacy-heading"
    >
      <h2 id="pharmacy-heading" className="text-lg font-bold uppercase tracking-wide text-text-secondary">
        Pharmacy
      </h2>
      <p className="mt-2 text-xl font-bold text-text-primary">{med.pharmacy || 'Your pharmacy'}</p>
      {med.pharmacy_phone ? (
        <a
          href={`tel:${med.pharmacy_phone}`}
          className="mt-3 flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-primary px-6 text-xl font-bold text-primary-contrast"
        >
          📞 Call {med.pharmacy_phone}
        </a>
      ) : (
        <p className="mt-2 text-base text-text-secondary">
          Add a phone number to call your pharmacy in one tap.
        </p>
      )}
    </section>
  )
}

export default function MedicationsPage() {
  const [meds, setMeds] = useState<MedicationRow[]>([])
  const [logs, setLogs] = useState<MedicationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<MedForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [savingForm, setSavingForm] = useState(false)

  const [showArchived, setShowArchived] = useState(false)
  const [archived, setArchived] = useState<MedicationRow[]>([])
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)

  // photo prescription flow
  const [photoOpen, setPhotoOpen] = useState(false)
  const [photoNotice, setPhotoNotice] = useState(false)

  // 7-day adherence
  const [weekLogs, setWeekLogs] = useState<Record<string, MedicationLog[]>>({})

  const fail = useCallback((message: string, retry: () => void) => {
    setError(message)
    setRetryAction(() => retry)
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const today = localDateKey(new Date())
      const tzOffset = new Date().getTimezoneOffset()
      const [medsRes, logsRes] = await Promise.all([
        fetch('/api/medications'),
        fetch(`/api/medication-logs?date=${today}&tz_offset=${tzOffset}`),
      ])
      const medsData = await medsRes.json()
      const logsData = await logsRes.json()
      if (!medsRes.ok) throw new Error(medsData.error || 'meds')
      if (!logsRes.ok) throw new Error(logsData.error || 'logs')
      setMeds(medsData.medications ?? [])
      setLogs(logsData.logs ?? [])
      // Past 6 days of logs for the weekly adherence strip (best effort).
      const pastDates: string[] = []
      for (let i = 1; i <= 6; i++) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        pastDates.push(localDateKey(d))
      }
      const weekResults = await Promise.all(
        pastDates.map(async (date) => {
          try {
            const r = await fetch(`/api/medication-logs?date=${date}&tz_offset=${tzOffset}`)
            const j = await r.json()
            return { date, logs: (r.ok ? j.logs : []) as MedicationLog[] }
          } catch {
            return { date, logs: [] as MedicationLog[] }
          }
        })
      )
      const map: Record<string, MedicationLog[]> = { [today]: logsData.logs ?? [] }
      for (const w of weekResults) map[w.date] = w.logs
      setWeekLogs(map)
    } catch {
      fail("We couldn't load your medicines right now.", loadAll)
    } finally {
      setLoading(false)
    }
  }, [fail])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const logsForMed = (medId: string) => logs.filter((l) => l.medication_id === medId)
  const takenCountForMed = (medId: string) =>
    logsForMed(medId).filter((l) => l.status === 'taken').length
  const latestLogForMed = (medId: string) =>
    logsForMed(medId).sort((a, b) =>
      (b.logged_at ?? '').localeCompare(a.logged_at ?? ''),
    )[0] ?? null

  async function markStatus(med: MedicationRow, status: 'taken' | 'snoozed') {
    setActingId(med.id)
    setError(null)
    try {
      const res = await fetch('/api/medication-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medication_id: med.id,
          status,
          date: localDateKey(new Date()),
          tz_offset: new Date().getTimezoneOffset(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'log')
      const log = data.log as MedicationLog
      // The API returns the created/updated row: replace it by id and keep
      // every other row, so multiple taken doses in one day all survive.
      setLogs((prev) => [...prev.filter((l) => l.id !== log.id), log])
    } catch {
      fail("We couldn't save that.", () => markStatus(med, status))
    } finally {
      setActingId(null)
    }
  }

  /** Map a vision-extraction result onto the medicine form, then let the
      person review and confirm — nothing is saved from the photo alone. */
  function handlePhotoExtracted(data: Record<string, unknown>) {
    const str = (v: unknown): string => (typeof v === 'string' ? v : '')
    const freqRaw = str(data.frequency).toLowerCase() + ' ' + str(data.directions).toLowerCase()
    let frequency = 'Daily'
    let asNeeded = false
    if (/as needed|prn/.test(freqRaw)) {
      frequency = 'As needed'
      asNeeded = true
    } else if (/three|3x|three times/.test(freqRaw)) {
      frequency = 'Three times daily'
    } else if (/twice|2x|two times|bid/.test(freqRaw)) {
      frequency = 'Twice daily'
    } else if (/week/.test(freqRaw)) {
      frequency = 'Weekly'
    }
    const refillsRaw = str(data.refills)
    const refillsNum = refillsRaw.match(/\d+/)?.[0] ?? ''
    setEditingId(null)
    setForm({
      ...emptyForm,
      name: str(data.name),
      dose: str(data.strength),
      frequency,
      as_needed: asNeeded,
      instructions: str(data.directions),
      instruction_source: str(data.name) ? 'prescription' : 'user',
      prescriber: str(data.prescriber),
      pharmacy: str(data.pharmacy),
      refills_remaining: refillsNum,
    })
    setFormError(null)
    setPhotoNotice(true)
    setPhotoOpen(false)
    setFormOpen(true)
  }

  function openAdd() {
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(med: MedicationRow) {
    setEditingId(med.id)
    setForm({
      name: med.name,
      dose: med.dose ?? '',
      frequency: med.frequency || 'Daily',
      time: med.time || '08:00',
      as_needed: med.as_needed ?? false,
      instructions: med.instructions ?? '',
      instruction_source: med.instruction_source || 'user',
      prescriber: med.prescriber ?? '',
      pharmacy: med.pharmacy ?? '',
      pharmacy_phone: med.pharmacy_phone ?? '',
      refill_date: med.refill_date ?? '',
      refills_remaining:
        med.refills_remaining === null || med.refills_remaining === undefined
          ? ''
          : String(med.refills_remaining),
    })
    setFormError(null)
    setFormOpen(true)
  }

  async function handleSaveForm() {
    setFormError(null)
    if (form.name.trim() === '') {
      setFormError('Please give the medicine a name.')
      return
    }
    setSavingForm(true)
    const payload = {
      name: form.name.trim(),
      dose: form.dose.trim() || null,
      frequency: form.frequency,
      time: form.time,
      as_needed: form.as_needed,
      instructions: form.instructions.trim() || null,
      instruction_source: form.instruction_source,
      prescriber: form.prescriber.trim() || null,
      pharmacy: form.pharmacy.trim() || null,
      pharmacy_phone: form.pharmacy_phone.trim() || null,
      refill_date: form.refill_date || null,
      refills_remaining: form.refills_remaining.trim() === '' ? null : form.refills_remaining.trim(),
    }
    try {
      const res = await fetch(
        editingId ? `/api/medications/${editingId}` : '/api/medications',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'save')
      setFormOpen(false)
      loadAll()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "We couldn't save that medicine.")
    } finally {
      setSavingForm(false)
    }
  }

  async function handleArchive(med: MedicationRow) {
    if (archiveConfirmId !== med.id) {
      setArchiveConfirmId(med.id)
      return
    }
    setArchiveConfirmId(null)
    setActingId(med.id)
    try {
      const res = await fetch(`/api/medications/${med.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'archive')
      setMeds((prev) => prev.filter((m) => m.id !== med.id))
      setArchived((prev) => [...prev, { ...med, active: false }])
    } catch {
      fail("We couldn't archive that medicine.", () => handleArchive(med))
    } finally {
      setActingId(null)
    }
  }

  async function handleRestore(med: MedicationRow) {
    setActingId(med.id)
    try {
      const res = await fetch(`/api/medications/${med.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'restore')
      setArchived((prev) => prev.filter((m) => m.id !== med.id))
      setMeds((prev) => [...prev, data.medication].sort((a, b) => a.time.localeCompare(b.time)))
    } catch {
      fail("We couldn't restore that medicine.", () => handleRestore(med))
    } finally {
      setActingId(null)
    }
  }

  const set = <K extends keyof MedForm>(key: K, value: MedForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Medicines</h1>
          <p className="mt-1 text-lg text-text-secondary">Today&apos;s schedule, all in one place.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setPhotoOpen(true)}
            className="min-h-[56px] rounded-xl border-2 border-primary px-5 text-xl font-bold text-primary"
          >
            📷 Photo
          </button>
          <button
            onClick={openAdd}
            className="min-h-[56px] rounded-xl bg-primary px-6 text-xl font-bold text-primary-contrast hover:bg-primary-hover"
          >
            + Add
          </button>
        </div>
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
              className="mt-3 min-h-[48px] rounded-xl bg-danger px-6 text-lg font-bold text-on-danger hover:bg-danger"
            >
              Try Again
            </button>
          )}
        </div>
      )}

      {/* Photo prescription capture */}
      {photoOpen && (
        <div className="mt-6">
          <PhotoCapture
            kind="medicine"
            onExtracted={handlePhotoExtracted}
            onCancel={() => setPhotoOpen(false)}
          />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-8">
      {/* Today's schedule */}
      <section aria-labelledby="schedule-heading">
        <h2 id="schedule-heading" className="text-2xl font-bold text-text-primary">Today</h2>
        {loading ? (
          <p className="mt-3 text-lg text-text-secondary">Loading…</p>
        ) : meds.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
            <p className="text-4xl" aria-hidden="true">💊</p>
            <p className="mt-2 text-xl font-bold text-text-primary">No medicines yet</p>
            <p className="mt-1 text-lg text-text-secondary">
              Take a picture of your prescription and we&apos;ll help set it up — or enter it by hand.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => setPhotoOpen(true)}
                className="min-h-[56px] rounded-xl border-2 border-primary px-6 text-xl font-bold text-primary"
              >
                📷 Take photo
              </button>
              <button
                onClick={openAdd}
                className="min-h-[56px] rounded-xl bg-primary px-6 text-xl font-bold text-primary-contrast hover:bg-primary-hover"
              >
                Enter manually
              </button>
            </div>
          </div>
        ) : (
          <ul className="mt-3 space-y-4">
            {meds.map((med) => {
              const takenCount = takenCountForMed(med.id)
              const latest = latestLogForMed(med.id)
              const badge = doseBadge(med, takenCount, latest?.status ?? null)
              const expected = med.as_needed ? null : dosesPerDay(med.frequency)
              const allDosesTaken = expected !== null && takenCount >= expected
              const estimate = refillEstimate(med)
              return (
                <li key={med.id} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-2xl font-bold text-text-primary">{med.name}</p>
                      <p className="mt-1 text-lg text-text-secondary">
                        {med.dose ? `${med.dose} · ` : ''}{med.frequency}
                        {med.as_needed ? ' · as needed' : ''} · {formatTime(med.time)}
                      </p>
                      {med.instructions && (
                        <p className="mt-2 text-base text-text-secondary">
                          <span className="font-semibold">Directions:</span> {med.instructions}{' '}
                          <span className="text-text-secondary">
                            (from {
                              med.instruction_source === 'prescription' ? 'your prescription'
                              : med.instruction_source === 'clinician' ? 'your doctor'
                              : med.instruction_source === 'pharmacist' ? 'your pharmacist'
                              : 'your own note'
                            })
                          </span>
                        </p>
                      )}
                      {estimate && (
                        <p className="mt-2 text-base font-semibold text-text-primary">{estimate}</p>
                      )}
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-base font-bold ${badge.classes}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      onClick={() => markStatus(med, 'taken')}
                      disabled={actingId === med.id || allDosesTaken}
                      className="min-h-[56px] rounded-xl bg-success px-4 text-xl font-bold text-on-success hover:bg-success disabled:opacity-50"
                    >
                      {allDosesTaken ? 'Taken ✓' : 'I Took It'}
                    </button>
                    <button
                      onClick={() => markStatus(med, 'snoozed')}
                      disabled={actingId === med.id}
                      className="min-h-[56px] rounded-xl border-2 border-border px-4 text-xl font-bold text-text-primary hover:bg-surface-secondary disabled:opacity-50"
                    >
                      Not Yet
                    </button>
                  </div>
                  <div className="mt-3 flex justify-end gap-4">
                    <button onClick={() => openEdit(med)} className="min-h-[44px] px-2 text-lg font-semibold text-primary underline">
                      Edit
                    </button>
                    <button
                      onClick={() => handleArchive(med)}
                      disabled={actingId === med.id}
                      className="min-h-[44px] px-2 text-lg font-semibold text-text-secondary underline"
                    >
                      {archiveConfirmId === med.id ? 'Tap again to archive' : 'Archive'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Archived */}
      <section>
        <button
          onClick={() => setShowArchived((v) => !v)}
          className="min-h-[48px] text-lg font-semibold text-text-secondary underline"
          aria-expanded={showArchived}
        >
          {showArchived ? 'Hide archived medicines' : 'Show archived medicines'}
        </button>
        {showArchived && (
          archived.length === 0 ? (
            <p className="mt-2 text-lg text-text-secondary">Nothing archived.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {archived.map((med) => (
                <li key={med.id} className="flex items-center justify-between rounded-2xl border border-border bg-surface-secondary p-4">
                  <p className="text-xl font-semibold text-text-primary">
                    {med.name}{med.dose ? ` · ${med.dose}` : ''}
                  </p>
                  <button
                    onClick={() => handleRestore(med)}
                    disabled={actingId === med.id}
                    className="min-h-[48px] rounded-xl border-2 border-primary px-5 text-lg font-bold text-primary"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </section>
        </div>

        {/* RIGHT COLUMN */}
        <aside className="space-y-6">
          <AdherenceCard meds={meds} weekLogs={weekLogs} />
          <RefillCard meds={meds} onEdit={openEdit} />
          <PharmacyCard meds={meds} />
          <Link
            href="/guide"
            className="block rounded-2xl border border-border bg-surface p-6 shadow-sm transition hover:shadow"
          >
            <p className="text-xl font-bold text-text-primary">💬 Ask about my medicines</p>
            <p className="mt-1 text-base text-text-secondary">
              The Health Guide knows your schedule and can answer questions about your medicines.
            </p>
          </Link>
        </aside>
      </div>

      {/* Add / edit form */}
      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setPhotoNotice(false)
        }}
        title={editingId ? 'Edit medicine' : 'Add a medicine'}
        wide
      >
        <div className="mt-2 space-y-4">
          {photoNotice && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4" role="status">
              <p className="text-lg font-semibold text-text-primary">
                📷 We read this from your photo — please check it before saving.
              </p>
            </div>
          )}
              <div>
                <label className={labelCls} htmlFor="med-name">Medicine name *</label>
                <input id="med-name" className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Amlodipine" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} htmlFor="med-dose">Dose</label>
                  <input id="med-dose" className={inputCls} value={form.dose} onChange={(e) => set('dose', e.target.value)} placeholder="5 mg" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="med-time">Time</label>
                  <input id="med-time" type="time" className={inputCls} value={form.time} onChange={(e) => set('time', e.target.value)} />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="med-freq">How often</label>
                <select id="med-freq" className={inputCls} value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => set('as_needed', !form.as_needed)}
                  aria-pressed={form.as_needed}
                  className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border-2 px-4 text-left text-lg font-semibold ${form.as_needed ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-primary'}`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-md border-2 ${form.as_needed ? 'border-primary bg-primary text-primary-contrast' : 'border-border'}`} aria-hidden="true">
                    {form.as_needed ? '✓' : ''}
                  </span>
                  Only take as needed
                </button>
              </div>
              <div>
                <label className={labelCls} htmlFor="med-instructions">Directions</label>
                <textarea id="med-instructions" rows={2} className="w-full min-h-[56px] rounded-xl border-2 border-border px-4 py-3 text-xl focus:border-primary focus:outline-none" value={form.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="Take with food…" />
              </div>
              <div>
                <label className={labelCls} htmlFor="med-source">Where are these directions from?</label>
                <select id="med-source" className={inputCls} value={form.instruction_source} onChange={(e) => set('instruction_source', e.target.value)}>
                  {INSTRUCTION_SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <p className="mt-1 text-base text-text-secondary">Directions from your prescription are the most reliable — they outrank anything else.</p>
              </div>
              <div>
                <label className={labelCls} htmlFor="med-prescriber">Prescribed by</label>
                <input id="med-prescriber" className={inputCls} value={form.prescriber} onChange={(e) => set('prescriber', e.target.value)} placeholder="Dr. Smith" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} htmlFor="med-pharmacy">Pharmacy</label>
                  <input id="med-pharmacy" className={inputCls} value={form.pharmacy} onChange={(e) => set('pharmacy', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="med-pharm-phone">Pharmacy phone</label>
                  <input id="med-pharm-phone" type="tel" className={inputCls} value={form.pharmacy_phone} onChange={(e) => set('pharmacy_phone', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} htmlFor="med-refill-date">Refill date</label>
                  <input id="med-refill-date" type="date" className={inputCls} value={form.refill_date} onChange={(e) => set('refill_date', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="med-refills">Refills left</label>
                  <input id="med-refills" inputMode="numeric" className={inputCls} value={form.refills_remaining} onChange={(e) => set('refills_remaining', e.target.value)} placeholder="3" />
                </div>
              </div>
            </div>

            {formError && <p className="mt-3 text-lg font-semibold text-danger" role="alert">{formError}</p>}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={() => setFormOpen(false)} className="min-h-[56px] rounded-xl border-2 border-border text-xl font-bold text-text-primary">
                Cancel
              </button>
              <button onClick={handleSaveForm} disabled={savingForm} className="min-h-[56px] rounded-xl bg-primary text-xl font-bold text-primary-contrast hover:bg-primary-hover disabled:opacity-50">
                {savingForm ? 'Saving…' : editingId ? 'Save changes' : 'Add medicine'}
              </button>
            </div>
      </Modal>
    </div>
  )
}
