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
  EmptyState,
  ErrorNote,
  inputCls,
  btnPrimary,
} from '../_ui'
import PhotoCapture from '@/components/PhotoCapture'

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

interface Meal {
  id: string
  meal_name: string
  meal_type: string | null
  portion: string | null
  sodium_mg: number | null
  logged_at: string
  notes: string | null
}

export default function FoodPage() {
  const profile = useProfile()
  const [meals, setMeals] = useState<Meal[]>([])
  const [total, setTotal] = useState(0)
  const [unknownCount, setUnknownCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showPhoto, setShowPhoto] = useState(false)
  const [photoNotice, setPhotoNotice] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('Lunch')
  const [portion, setPortion] = useState('')
  const [sodium, setSodium] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const r = await api<{ meals: Meal[]; total_sodium: number; unknown_sodium: number }>('/api/food')
      setMeals(r.meals)
      setTotal(r.total_sodium)
      setUnknownCount(r.unknown_sodium ?? 0)
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
          sodium_mg: sodium.trim() === '' ? null : sodium.trim(),
        }),
      })
      setName(''); setPortion(''); setSodium(''); setShowForm(false); setPhotoNotice(false)
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

  /** Photo/label scan pre-fills the form — the person confirms before anything saves. */
  function handlePhotoExtracted(data: Record<string, unknown>) {
    const str = (v: unknown): string => (typeof v === 'string' ? v : '')
    setName(str(data.meal_name) || str(data.product_name))
    setSodium(str(data.sodium_mg))
    if (str(data.portion)) setPortion(str(data.portion))
    setPhotoNotice(true)
    setShowPhoto(false)
    setShowForm(true)
  }

  const target = profile?.sodium_target || 2000
  const pct = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0
  const over = total > target

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title="Food"
        subtitle="Log what you eat. Sodium is the part that matters most for blood pressure."
        right={
          <div className="flex gap-2">
            <button
              className="min-h-[56px] rounded-xl border-2 border-primary px-5 text-xl font-bold text-primary"
              onClick={() => setShowPhoto((s) => !s)}
            >
              📷 Scan
            </button>
            <button className={btnPrimary} onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Close' : '+ Log a meal'}
            </button>
          </div>
        }
      />
      <ErrorNote message={error} />

      {showPhoto && (
        <div className="mb-6">
          <PhotoCapture
            kind="food"
            onExtracted={handlePhotoExtracted}
            onCancel={() => setShowPhoto(false)}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <Card className="mb-6">
            <SectionTitle>Today's sodium</SectionTitle>
            <p className="text-3xl font-bold text-text-primary">
              {total.toLocaleString()} <span className="text-base font-normal text-text-secondary">mg</span>
            </p>
            <p className={`font-semibold ${over ? 'text-danger' : 'text-text-secondary'}`}>
              {over ? 'Over your target' : `Target: ${target.toLocaleString()} mg`}
            </p>
            <div className="mt-2 h-4 rounded-full bg-surface-secondary overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full ${over ? 'bg-danger' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
            </div>
            {unknownCount > 0 && (
              <p className="mt-2 text-base text-text-secondary">
                {unknownCount} {unknownCount === 1 ? 'meal' : 'meals'} logged without sodium info — the total only counts what&apos;s known.
              </p>
            )}
          </Card>

          {showForm && (
            <Card className="mb-6">
              <SectionTitle>Log a meal</SectionTitle>
              {photoNotice && (
                <div className="mb-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-4" role="status">
                  <p className="text-lg font-semibold text-text-primary">
                    📷 We read this from your photo — please check it before saving. If the sodium wasn&apos;t readable, it&apos;s left blank rather than guessed.
                  </p>
                </div>
              )}
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
                  <Field label="Sodium (mg, optional)">
                    <input type="number" min={0} value={sodium} onChange={(e) => setSodium(e.target.value)} placeholder="Leave blank if unsure" className={inputCls} />
                  </Field>
                </div>
                <p className="text-sm text-text-secondary">
                  Not sure about sodium? Leave it blank — we won&apos;t guess. Scan the nutrition label with the 📷 button, or ask the Health Guide about the meal.
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
            <EmptyState>
              Nothing logged today yet. Tap 📷 Scan to read a nutrition label, or log a meal by hand.
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {meals.map((m) => (
                <Card key={m.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-text-primary">{m.meal_name}</p>
                      <p className="text-sm text-text-secondary">
                        {m.meal_type}
                        {m.portion ? ` · ${m.portion}` : ''} ·{' '}
                        {m.sodium_mg == null ? 'sodium unknown' : `${m.sodium_mg} mg sodium`}
                      </p>
                      <p className="text-sm text-text-secondary">
                        {new Date(m.logged_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    <button className="text-sm font-semibold text-text-secondary underline shrink-0" onClick={() => remove(m.id)}>
                      Remove
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-6" aria-label="Sodium guidance">
          <Card>
            <SectionTitle>Why sodium matters</SectionTitle>
            <p className="text-lg text-text-primary">
              Too much sodium can raise blood pressure. The American Heart Association
              suggests most adults aim for under 2,300 mg a day — and moving toward
              1,500 mg helps most people with high blood pressure.
            </p>
            <a
              href="https://www.heart.org/en/healthy-living/healthy-eating/eat-smart/sodium/how-much-sodium-should-i-eat-per-day"
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
            <p className="text-xl font-bold text-text-primary">💬 Ask about a meal</p>
            <p className="mt-1 text-base text-text-secondary">
              Send the Health Guide a photo of your plate or a label and ask how it fits your day.
            </p>
          </Link>
        </aside>
      </div>
    </main>
  )
}
