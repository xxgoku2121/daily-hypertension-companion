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
  inputCls,
  btnPrimary,
} from '../_ui'

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

interface Meal {
  id: string
  meal_name: string
  meal_type: string | null
  portion: string | null
  sodium_mg: number
  logged_at: string
  notes: string | null
}

export default function FoodPage() {
  const profile = useProfile()
  const [meals, setMeals] = useState<Meal[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('Lunch')
  const [portion, setPortion] = useState('')
  const [sodium, setSodium] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const r = await api<{ meals: Meal[]; total_sodium: number }>('/api/food')
      setMeals(r.meals)
      setTotal(r.total_sodium)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load meals.')
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function add() {
    if (!name.trim()) {
      setError('Please name the meal or food.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api('/api/food', {
        method: 'POST',
        body: JSON.stringify({
          meal_name: name.trim(),
          meal_type: type,
          portion: portion.trim() || null,
          sodium_mg: Math.max(0, Math.round(Number(sodium) || 0)),
        }),
      })
      setName(''); setPortion(''); setSodium(''); setShowForm(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the meal.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    try {
      await fetch(`/api/food?id=${id}`, { method: 'DELETE' })
      load()
    } catch {
      setError('Could not remove the meal.')
    }
  }

  const target = profile?.sodium_target || 2000
  const pct = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0
  const over = total > target

  return (
    <main className={`mx-auto max-w-3xl px-4 py-8 ${textSizeClass(profile?.text_size)}`}>
      <PageHeader
        title="Food"
        subtitle="Log what you eat. Sodium is the part that matters most for blood pressure."
        right={
          <button className={btnPrimary} onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Close' : '+ Log a meal'}
          </button>
        }
      />
      <ErrorNote message={error} />

      <Card className="mb-6">
        <SectionTitle>Today's sodium</SectionTitle>
        <p className="text-3xl font-bold text-slate-900">
          {total.toLocaleString()} <span className="text-base font-normal text-slate-500">mg</span>
        </p>
        <p className={`font-semibold ${over ? 'text-red-700' : 'text-slate-600'}`}>
          {over ? 'Over your target' : `Target: ${target.toLocaleString()} mg`}
        </p>
        <div className="mt-2 h-4 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full rounded-full ${over ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${pct}%` }} />
        </div>
      </Card>

      {showForm && (
        <Card className="mb-6">
          <SectionTitle>Log a meal</SectionTitle>
          <div className="grid gap-4">
            <Field label="What did you eat?">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken soup" className={inputCls} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Meal">
                <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                  {MEAL_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Portion (optional)">
                <input value={portion} onChange={(e) => setPortion(e.target.value)} placeholder="e.g. 1 bowl" className={inputCls} />
              </Field>
              <Field label="Sodium (mg, guess if unsure)">
                <input type="number" min={0} value={sodium} onChange={(e) => setSodium(e.target.value)} placeholder="e.g. 450" className={inputCls} />
              </Field>
            </div>
            <p className="text-sm text-slate-500">
              Not sure about sodium? A rough guess is fine — check the nutrition label when you can.
            </p>
            <div>
              <button className={btnPrimary} disabled={busy} onClick={add}>
                {busy ? 'Saving…' : 'Save meal'}
              </button>
            </div>
          </div>
        </Card>
      )}

      {meals.length === 0 ? (
        <EmptyState>Nothing logged today yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {meals.map((m) => (
            <Card key={m.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{m.meal_name}</p>
                  <p className="text-sm text-slate-600">
                    {m.meal_type}
                    {m.portion ? ` · ${m.portion}` : ''} · {m.sodium_mg} mg sodium
                  </p>
                  <p className="text-sm text-slate-500">
                    {new Date(m.logged_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                <button className="text-sm font-semibold text-slate-500 underline shrink-0" onClick={() => remove(m.id)}>
                  Remove
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
