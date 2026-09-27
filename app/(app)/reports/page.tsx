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
  EmptyState,
  ErrorNote,
  PrintStyles,
  fmtDate,
  inputCls,
  btnPrimary,
  btnSecondary,
} from '../_ui'

interface Question {
  id: string
  question: string
  source: string
  status: 'kept' | 'removed' | 'asked'
  created_at: string
}

function avg(nums: number[]) {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null
}

export default function ReportsPage() {
  const profile = useProfile()
  const [start, setStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<any | null>(null)

  const [questions, setQuestions] = useState<Question[]>([])
  const [newQ, setNewQ] = useState('')
  const [qBusy, setQBusy] = useState(false)

  async function loadQuestions() {
    try {
      const r = await api<{ questions: Question[] }>('/api/doctor-questions')
      setQuestions(r.questions)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load questions.')
    }
  }
  useEffect(() => {
    loadQuestions()
  }, [])

  async function generate() {
    setGenerating(true)
    setError(null)
    setReport(null)
    try {
      const res = await fetch('/api/export?format=json')
      if (!res.ok) throw new Error('Your data could not be read right now.')
      const snap = await res.json()
      const t = snap.tables
      const from = new Date(start + 'T00:00:00').getTime()
      const to = new Date(end + 'T23:59:59.999').getTime()
      const inRange = (iso: string) => {
        const ms = new Date(iso).getTime()
        return ms >= from && ms <= to
      }
      const readings = (t.bp_readings || []).filter((r: any) => inRange(r.measured_at))
      const morning = readings.filter((r: any) => r.period === 'morning')
      const evening = readings.filter((r: any) => r.period === 'evening')
      const meds = (t.medications || []).filter((m: any) => m.active)
      const logs = (t.medication_logs || []).filter((l: any) => inRange(l.logged_at))
      const counted = logs.filter((l: any) => ['taken', 'skipped', 'not_taken'].includes(l.status))
      const taken = logs.filter((l: any) => l.status === 'taken').length
      const kept = (t.doctor_questions || []).filter((q: any) => q.status === 'kept')

      const stat = (arr: any[]) =>
        arr.length
          ? {
              n: arr.length,
              s: avg(arr.map((r) => r.systolic)),
              d: avg(arr.map((r) => r.diastolic)),
              p: avg(arr.map((r) => r.pulse).filter((x: any) => x != null)),
            }
          : null

      const byMed: Record<string, { taken: number; counted: number; name: string }> = {}
      for (const l of logs) {
        if (!['taken', 'skipped', 'not_taken'].includes(l.status)) continue
        const med = meds.find((m: any) => m.id === l.medication_id)
        const key = l.medication_id
        if (!byMed[key]) byMed[key] = { taken: 0, counted: 0, name: med?.name || 'A medicine' }
        byMed[key].counted += 1
        if (l.status === 'taken') byMed[key].taken += 1
      }

      setReport({
        start,
        end,
        name: snap.tables.profile?.name || 'Patient',
        readings: stat(readings),
        morning: stat(morning),
        evening: stat(evening),
        adherence: counted.length ? Math.round((taken / counted.length) * 100) : null,
        dosesCounted: counted.length,
        byMed: Object.values(byMed),
        questions: kept,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate the report.')
    } finally {
      setGenerating(false)
    }
  }

  async function addQuestion() {
    if (!newQ.trim()) return
    setQBusy(true)
    try {
      await api('/api/doctor-questions', { method: 'POST', body: JSON.stringify({ question: newQ.trim() }) })
      setNewQ('')
      loadQuestions()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the question.')
    } finally {
      setQBusy(false)
    }
  }

  async function setQStatus(id: string, status: Question['status']) {
    try {
      await api('/api/doctor-questions', { method: 'PATCH', body: JSON.stringify({ id, status }) })
      loadQuestions()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the question.')
    }
  }

  async function removeQuestion(id: string) {
    try {
      await fetch(`/api/doctor-questions?id=${id}`, { method: 'DELETE' })
      loadQuestions()
    } catch {
      setError('Could not remove the question.')
    }
  }

  const kept = questions.filter((q) => q.status === 'kept')
  const asked = questions.filter((q) => q.status === 'asked')

  return (
    <main className={`mx-auto max-w-3xl px-4 py-8 ${textSizeClass(profile?.text_size)}`}>
      <PrintStyles />
      <PageHeader title="Doctor reports" subtitle="A clear summary to bring to your appointment." />
      <ErrorNote message={error} />

      <Card className="mb-6 no-print">
        <SectionTitle>Make a report</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 mb-4">
          <Field label="From">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
          </Field>
          <Field label="To">
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <button className={btnPrimary} disabled={generating} onClick={generate}>
          {generating ? 'Making your report…' : 'Generate report'}
        </button>
      </Card>

      {report && (
        <div className="print-area">
          <Card className="mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Health summary for {report.name}</h2>
                <p className="text-slate-600">
                  {fmtDate(report.start + 'T00:00:00')} – {fmtDate(report.end + 'T00:00:00')}
                </p>
              </div>
              <button className={`${btnSecondary} no-print`} onClick={() => window.print()}>
                Print / Save PDF
              </button>
            </div>

            <div className="space-y-5 text-slate-800">
              <section>
                <h3 className="font-bold text-lg mb-1">Blood pressure</h3>
                {report.readings ? (
                  <ul className="list-disc ml-5">
                    <li>
                      Overall: {report.readings.s} / {report.readings.d} mmHg average
                      {report.readings.p ? `, pulse ${report.readings.p}` : ''} ({report.readings.n} readings)
                    </li>
                    {report.morning && (
                      <li>
                        Morning: {report.morning.s} / {report.morning.d} mmHg ({report.morning.n} readings)
                      </li>
                    )}
                    {report.evening && (
                      <li>
                        Evening: {report.evening.s} / {report.evening.d} mmHg ({report.evening.n} readings)
                      </li>
                    )}
                  </ul>
                ) : (
                  <p>No readings in this period.</p>
                )}
              </section>

              <section>
                <h3 className="font-bold text-lg mb-1">Medicines</h3>
                {report.byMed.length === 0 ? (
                  <p>No dose records in this period.</p>
                ) : (
                  <ul className="list-disc ml-5">
                    {report.byMed.map((m: any, i: number) => (
                      <li key={i}>
                        {m.name}: {m.counted ? Math.round((m.taken / m.counted) * 100) : 0}% of doses taken
                        ({m.taken} of {m.counted})
                      </li>
                    ))}
                  </ul>
                )}
                {report.adherence !== null && (
                  <p className="mt-1 font-semibold">Overall: {report.adherence}% of doses taken on schedule.</p>
                )}
              </section>

              <section>
                <h3 className="font-bold text-lg mb-1">Questions for the doctor</h3>
                {report.questions.length === 0 ? (
                  <p>None saved for this report.</p>
                ) : (
                  <ol className="list-decimal ml-5">
                    {report.questions.map((q: any) => (
                      <li key={q.id}>{q.question}</li>
                    ))}
                  </ol>
                )}
              </section>

              <p className="text-sm text-slate-500">
                Generated {new Date().toLocaleString()}. This summary is for discussion with your doctor — it is not
                medical advice.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Questions manager */}
      <Card className="no-print">
        <SectionTitle>Questions for my doctor</SectionTitle>
        <p className="text-slate-600 mb-4">Write down anything you want to ask at your next visit.</p>
        <div className="flex gap-2 mb-4">
          <input
            value={newQ}
            onChange={(e) => setNewQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addQuestion()}
            placeholder="e.g. Should I take my pill earlier in the day?"
            className={inputCls}
          />
          <button className={btnPrimary} disabled={qBusy || !newQ.trim()} onClick={addQuestion}>
            Add
          </button>
        </div>

        {kept.length === 0 && asked.length === 0 ? (
          <EmptyState>No questions yet. Add one above.</EmptyState>
        ) : (
          <div className="space-y-2">
            {kept.map((q) => (
              <div key={q.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-slate-800">{q.question}</p>
                <div className="flex shrink-0 gap-2">
                  <button className="text-sm font-semibold text-green-700 underline" onClick={() => setQStatus(q.id, 'asked')}>
                    Mark asked
                  </button>
                  <button className="text-sm font-semibold text-slate-500 underline" onClick={() => setQStatus(q.id, 'removed')}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {asked.length > 0 && (
              <div className="pt-2">
                <p className="text-sm font-semibold text-slate-500 mb-2">Already asked</p>
                {asked.map((q) => (
                  <div key={q.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 opacity-70">
                    <p className="text-slate-700 line-through">{q.question}</p>
                    <button className="text-sm font-semibold text-red-700 underline shrink-0" onClick={() => removeQuestion(q.id)}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </main>
  )
}
