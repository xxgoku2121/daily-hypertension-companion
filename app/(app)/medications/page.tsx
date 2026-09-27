'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Medication, MedicationLog } from '@/lib/types'

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

/** Rough, hedged estimate of remaining supply. Never an exact claim. */
function refillEstimate(med: MedicationRow): string | null {
  if (med.refills_remaining === null || med.refills_remaining === undefined) return null
  const freq = (med.frequency || '').toLowerCase()
  const dosesPerDay = freq.includes('twice') ? 2 : freq.includes('three') ? 3 : 1
  const approxDays = Math.max(1, Math.round(med.refills_remaining / dosesPerDay))
  return `Approximately ${approxDays} day${approxDays === 1 ? '' : 's'} of refills may remain.`
}

function statusBadge(status: string): { label: string; classes: string } {
  switch (status) {
    case 'taken':
      return { label: 'Taken ✓', classes: 'bg-green-100 text-green-800' }
    case 'skipped':
      return { label: 'Skipped', classes: 'bg-slate-200 text-slate-700' }
    case 'snoozed':
      return { label: 'Not yet', classes: 'bg-amber-100 text-amber-800' }
    default:
      return { label: 'Pending', classes: 'bg-blue-100 text-blue-800' }
  }
}

const inputCls =
  'w-full min-h-[56px] rounded-xl border-2 border-slate-300 px-4 text-xl focus:border-blue-600 focus:outline-none'
const labelCls = 'block text-lg font-semibold text-slate-800 mb-2'

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
    } catch {
      fail("We couldn't load your medicines right now.", loadAll)
    } finally {
      setLoading(false)
    }
  }, [fail])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const logByMed = (medId: string) => logs.find((l) => l.medication_id === medId)

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
      setLogs((prev) => {
        const rest = prev.filter((l) => l.id !== log.id && l.medication_id !== med.id)
        return [...rest, log]
      })
    } catch {
      fail("We couldn't save that.", () => markStatus(med, status))
    } finally {
      setActingId(null)
    }
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
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Medicines</h1>
          <p className="mt-1 text-lg text-slate-600">Today&apos;s schedule, all in one place.</p>
        </div>
        <button
          onClick={openAdd}
          className="min-h-[56px] shrink-0 rounded-xl bg-blue-700 px-6 text-xl font-bold text-white hover:bg-blue-800"
        >
          + Add
        </button>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4" role="alert">
          <p className="text-lg font-semibold text-red-900">{error}</p>
          {retryAction && (
            <button
              onClick={() => {
                setError(null)
                retryAction()
              }}
              className="mt-3 min-h-[48px] rounded-xl bg-red-700 px-6 text-lg font-bold text-white hover:bg-red-800"
            >
              Try Again
            </button>
          )}
        </div>
      )}

      {/* Today's schedule */}
      <section aria-labelledby="schedule-heading">
        <h2 id="schedule-heading" className="text-2xl font-bold text-slate-900">Today</h2>
        {loading ? (
          <p className="mt-3 text-lg text-slate-600">Loading…</p>
        ) : meds.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-lg text-slate-600">No medicines yet. Add your first one to get started.</p>
            <button
              onClick={openAdd}
              className="mt-4 min-h-[56px] rounded-xl bg-blue-700 px-8 text-xl font-bold text-white hover:bg-blue-800"
            >
              Add a medicine
            </button>
          </div>
        ) : (
          <ul className="mt-3 space-y-4">
            {meds.map((med) => {
              const log = logByMed(med.id)
              const badge = statusBadge(log?.status ?? 'pending')
              const estimate = refillEstimate(med)
              return (
                <li key={med.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-2xl font-bold text-slate-900">{med.name}</p>
                      <p className="mt-1 text-lg text-slate-600">
                        {med.dose ? `${med.dose} · ` : ''}{med.frequency}
                        {med.as_needed ? ' · as needed' : ''} · {formatTime(med.time)}
                      </p>
                      {med.instructions && (
                        <p className="mt-2 text-base text-slate-600">
                          <span className="font-semibold">Directions:</span> {med.instructions}{' '}
                          <span className="text-slate-500">
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
                        <p className="mt-2 text-base font-semibold text-slate-700">{estimate}</p>
                      )}
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-base font-bold ${badge.classes}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      onClick={() => markStatus(med, 'taken')}
                      disabled={actingId === med.id}
                      className="min-h-[56px] rounded-xl bg-green-700 px-4 text-xl font-bold text-white hover:bg-green-800 disabled:opacity-50"
                    >
                      I Took It
                    </button>
                    <button
                      onClick={() => markStatus(med, 'snoozed')}
                      disabled={actingId === med.id}
                      className="min-h-[56px] rounded-xl border-2 border-slate-400 px-4 text-xl font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Not Yet
                    </button>
                  </div>
                  <div className="mt-3 flex justify-end gap-4">
                    <button onClick={() => openEdit(med)} className="min-h-[44px] px-2 text-lg font-semibold text-blue-800 underline">
                      Edit
                    </button>
                    <button
                      onClick={() => handleArchive(med)}
                      disabled={actingId === med.id}
                      className="min-h-[44px] px-2 text-lg font-semibold text-slate-600 underline"
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
          className="min-h-[48px] text-lg font-semibold text-slate-600 underline"
          aria-expanded={showArchived}
        >
          {showArchived ? 'Hide archived medicines' : 'Show archived medicines'}
        </button>
        {showArchived && (
          archived.length === 0 ? (
            <p className="mt-2 text-lg text-slate-500">Nothing archived.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {archived.map((med) => (
                <li key={med.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xl font-semibold text-slate-700">
                    {med.name}{med.dose ? ` · ${med.dose}` : ''}
                  </p>
                  <button
                    onClick={() => handleRestore(med)}
                    disabled={actingId === med.id}
                    className="min-h-[48px] rounded-xl border-2 border-blue-700 px-5 text-lg font-bold text-blue-800"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </section>

      {/* Add / edit form */}
      {formOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="med-form-title">
          <div className="mx-auto my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="med-form-title" className="text-2xl font-bold text-slate-900">
              {editingId ? 'Edit medicine' : 'Add a medicine'}
            </h2>

            <div className="mt-4 space-y-4">
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
                  className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border-2 px-4 text-left text-lg font-semibold ${form.as_needed ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-slate-300 text-slate-800'}`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-md border-2 ${form.as_needed ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-400'}`} aria-hidden="true">
                    {form.as_needed ? '✓' : ''}
                  </span>
                  Only take as needed
                </button>
              </div>
              <div>
                <label className={labelCls} htmlFor="med-instructions">Directions</label>
                <textarea id="med-instructions" rows={2} className="w-full min-h-[56px] rounded-xl border-2 border-slate-300 px-4 py-3 text-xl focus:border-blue-600 focus:outline-none" value={form.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="Take with food…" />
              </div>
              <div>
                <label className={labelCls} htmlFor="med-source">Where are these directions from?</label>
                <select id="med-source" className={inputCls} value={form.instruction_source} onChange={(e) => set('instruction_source', e.target.value)}>
                  {INSTRUCTION_SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <p className="mt-1 text-base text-slate-500">Directions from your prescription are the most reliable — they outrank anything else.</p>
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

            {formError && <p className="mt-3 text-lg font-semibold text-red-700" role="alert">{formError}</p>}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={() => setFormOpen(false)} className="min-h-[56px] rounded-xl border-2 border-slate-400 text-xl font-bold text-slate-800">
                Cancel
              </button>
              <button onClick={handleSaveForm} disabled={savingForm} className="min-h-[56px] rounded-xl bg-blue-700 text-xl font-bold text-white hover:bg-blue-800 disabled:opacity-50">
                {savingForm ? 'Saving…' : editingId ? 'Save changes' : 'Add medicine'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
