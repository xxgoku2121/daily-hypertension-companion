'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  api,
  useProfile,
  textSizeClass,
  PageHeader,
  Card,
  SectionTitle,
  Field,
  EmptyState,
  ErrorNote,
  PrintStyles,
  fmtDateTime,
  inputCls,
  btnPrimary,
  btnSecondary,
} from '../_ui'

interface Appointment {
  id: string
  title: string
  date_time: string
  location: string | null
  doctor: string | null
  notes: string | null
  transport_needed: boolean
  status: 'upcoming' | 'done' | 'cancelled'
}

interface Snapshot {
  tables: {
    bp_readings: any[]
    medications: any[]
    medication_logs: any[]
    doctor_questions: any[]
  }
}

function avg(nums: number[]) {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null
}

function VisitSummary({ appt }: { appt: Appointment }) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/export?format=json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSnap(j))
      .catch(() => setSnap(null))
      .finally(() => setLoading(false))
  }, [])

  const summary = useMemo(() => {
    if (!snap) return null
    const twoWeeksAgo = Date.now() - 14 * 24 * 3600 * 1000
    const readings = (snap.tables.bp_readings || []).filter(
      (r: any) => new Date(r.measured_at).getTime() >= twoWeeksAgo
    )
    const morning = readings.filter((r: any) => r.period === 'morning')
    const evening = readings.filter((r: any) => r.period === 'evening')
    const meds = (snap.tables.medications || []).filter((m: any) => m.active)
    const logs = (snap.tables.medication_logs || []).filter(
      (l: any) => new Date(l.logged_at).getTime() >= twoWeeksAgo
    )
    const counted = logs.filter((l: any) => ['taken', 'skipped', 'not_taken'].includes(l.status))
    const taken = logs.filter((l: any) => l.status === 'taken').length
    const questions = (snap.tables.doctor_questions || []).filter((q: any) => q.status === 'kept')
    return {
      count: readings.length,
      mAvg: morning.length ? { s: avg(morning.map((r: any) => r.systolic)), d: avg(morning.map((r: any) => r.diastolic)), n: morning.length } : null,
      eAvg: evening.length ? { s: avg(evening.map((r: any) => r.systolic)), d: avg(evening.map((r: any) => r.diastolic)), n: evening.length } : null,
      meds,
      adherence: counted.length ? Math.round((taken / counted.length) * 100) : null,
      questions,
    }
  }, [snap])

  return (
    <div className="print-area rounded-2xl border-2 border-blue-200 bg-blue-50 p-5 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="text-lg font-bold text-blue-900">Visit summary — ready for your doctor</h3>
        <button className={`${btnSecondary} no-print`} onClick={() => window.print()}>
          Print
        </button>
      </div>
      <p className="text-slate-700 mb-3">
        {appt.title}
        {appt.doctor ? ` with ${appt.doctor}` : ''} · {fmtDateTime(appt.date_time)}
        {appt.location ? ` · ${appt.location}` : ''}
      </p>
      {loading ? (
        <p className="text-slate-500">Preparing your summary…</p>
      ) : !summary ? (
        <p className="text-slate-600">Your summary could not be prepared right now.</p>
      ) : (
        <div className="space-y-3 text-slate-800">
          <div>
            <p className="font-semibold">Blood pressure — last 14 days ({summary.count} readings)</p>
            {summary.mAvg && (
              <p>Morning average: {summary.mAvg.s} / {summary.mAvg.d} mmHg ({summary.mAvg.n} readings)</p>
            )}
            {summary.eAvg && (
              <p>Evening average: {summary.eAvg.s} / {summary.eAvg.d} mmHg ({summary.eAvg.n} readings)</p>
            )}
            {!summary.mAvg && !summary.eAvg && <p>No readings in the last 14 days.</p>}
          </div>
          <div>
            <p className="font-semibold">Medicines ({summary.meds.length})</p>
            {summary.meds.length === 0 ? (
              <p>No active medicines recorded.</p>
            ) : (
              <ul className="list-disc ml-5">
                {summary.meds.map((m: any) => (
                  <li key={m.id}>
                    {m.name}{m.dose ? ` ${m.dose}` : ''}{m.time ? ` at ${m.time}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {summary.adherence !== null && <p>Doses taken as scheduled: {summary.adherence}% (last 14 days)</p>}
          </div>
          <div>
            <p className="font-semibold">Questions for the doctor ({summary.questions.length})</p>
            {summary.questions.length === 0 ? (
              <p>None saved. You can add questions on the Reports page.</p>
            ) : (
              <ol className="list-decimal ml-5">
                {summary.questions.map((q: any) => (
                  <li key={q.id}>{q.question}</li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AppointmentsPage() {
  const profile = useProfile()
  const [appts, setAppts] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [title, setTitle] = useState('')
  const [dateTime, setDateTime] = useState('')
  const [location, setLocation] = useState('')
  const [doctor, setDoctor] = useState('')
  const [notes, setNotes] = useState('')
  const [transport, setTransport] = useState(false)
  const [adding, setAdding] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const r = await api<{ appointments: Appointment[] }>('/api/appointments')
      setAppts(r.appointments)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load appointments.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function add() {
    if (!title.trim() || !dateTime) {
      setError('Please give the appointment a title and a date and time.')
      return
    }
    setAdding(true)
    setError(null)
    try {
      await api('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          date_time: new Date(dateTime).toISOString(),
          location: location.trim() || null,
          doctor: doctor.trim() || null,
          notes: notes.trim() || null,
          transport_needed: transport,
        }),
      })
      setTitle(''); setDateTime(''); setLocation(''); setDoctor(''); setNotes(''); setTransport(false)
      setShowForm(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the appointment.')
    } finally {
      setAdding(false)
    }
  }

  async function setStatus(id: string, status: Appointment['status']) {
    try {
      await api('/api/appointments', { method: 'PATCH', body: JSON.stringify({ id, status }) })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the appointment.')
    }
  }

  const now = Date.now()
  const upcoming = appts.filter((a) => a.status === 'upcoming' && new Date(a.date_time).getTime() >= now)
    .sort((a, b) => +new Date(a.date_time) - +new Date(b.date_time))
  const past = appts.filter((a) => a.status !== 'upcoming' || new Date(a.date_time).getTime() < now)
    .sort((a, b) => +new Date(b.date_time) - +new Date(a.date_time))
  const within48h = upcoming.filter((a) => new Date(a.date_time).getTime() - now <= 48 * 3600 * 1000)

  return (
    <main className={`mx-auto max-w-3xl px-4 py-8 ${textSizeClass(profile?.text_size)}`}>
      <PrintStyles />
      <PageHeader
        title="Appointments"
        subtitle="Doctor visits and reminders, all in one place."
        right={
          <button className={btnPrimary} onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Close' : '+ Add appointment'}
          </button>
        }
      />
      <ErrorNote message={error} />

      {showForm && (
        <Card className="mb-6 no-print">
          <SectionTitle>Add an appointment</SectionTitle>
          <div className="grid gap-4">
            <Field label="What is it for?">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Checkup with Dr. Smith" className={inputCls} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date and time">
                <input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Doctor (optional)">
                <input value={doctor} onChange={(e) => setDoctor(e.target.value)} placeholder="Doctor's name" className={inputCls} />
              </Field>
            </div>
            <Field label="Location (optional)">
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Clinic address" className={inputCls} />
            </Field>
            <Field label="Notes (optional)">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
            </Field>
            <label className="flex items-center gap-3 font-semibold text-slate-800">
              <input type="checkbox" checked={transport} onChange={(e) => setTransport(e.target.checked)} className="h-6 w-6" />
              I need help getting there
            </label>
            <div>
              <button className={btnPrimary} disabled={adding} onClick={add}>
                {adding ? 'Saving…' : 'Save appointment'}
              </button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-8">
          <section>
            <SectionTitle>Upcoming ({upcoming.length})</SectionTitle>
            {upcoming.length === 0 ? (
              <EmptyState>No upcoming appointments.</EmptyState>
            ) : (
              <div className="space-y-4">
                {upcoming.map((a) => (
                  <Card key={a.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-slate-900">{a.title}</p>
                        <p className="text-slate-600">{fmtDateTime(a.date_time)}</p>
                        {a.doctor && <p className="text-slate-600">With {a.doctor}</p>}
                        {a.location && <p className="text-slate-600">{a.location}</p>}
                        {a.transport_needed && <p className="text-amber-700 font-semibold">🚗 Needs transport help</p>}
                        {a.notes && <p className="text-slate-600 mt-1">{a.notes}</p>}
                      </div>
                      <div className="flex gap-2 no-print">
                        <button className={btnSecondary} onClick={() => setStatus(a.id, 'done')}>Mark done</button>
                        <button className={btnSecondary} onClick={() => setStatus(a.id, 'cancelled')}>Cancel</button>
                      </div>
                    </div>
                    {within48h.some((w) => w.id === a.id) && <VisitSummary appt={a} />}
                  </Card>
                ))}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section>
              <SectionTitle>Past ({past.length})</SectionTitle>
              <div className="space-y-3">
                {past.map((a) => (
                  <Card key={a.id} className="opacity-80">
                    <p className="font-bold text-slate-900">{a.title}</p>
                    <p className="text-slate-600 text-sm">
                      {fmtDateTime(a.date_time)} · {a.status === 'done' ? 'Done' : a.status === 'cancelled' ? 'Cancelled' : 'Passed'}
                    </p>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  )
}
