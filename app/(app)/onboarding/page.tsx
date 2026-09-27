'use client'

/* 5-step skippable onboarding. Every step can be skipped; finishing (or
   skipping through) marks profiles.onboarding_state.status = 'done' and
   sends the user to /home. The shell's onboarding guard enforces this. */

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { applyThemePrefs } from '@/lib/theme'
import type { Appearance, TextSize } from '@/lib/types'
import { Button, Card, Icon, Input, PageHeader, Toggle } from '@/components/ui'

const STEPS = [
  'Your name',
  'Blood pressure schedule',
  'Medications',
  'Comfort & readability',
  'Caregiver (optional)',
] as const

interface MedDraft {
  name: string
  dose: string
  time: string
}

const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'blue', label: 'Blue' },
  { value: 'dark', label: 'Dark' },
  { value: 'high_contrast', label: 'High contrast' },
]

const TEXT_SIZES: { value: TextSize; label: string; hint: string }[] = [
  { value: 'normal', label: 'Normal', hint: 'Standard size' },
  { value: 'large', label: 'Large', hint: 'Easier to read' },
  { value: 'extra_large', label: 'Extra large', hint: 'Largest text & buttons' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [bpMorning, setBpMorning] = useState('08:00')
  const [bpEvening, setBpEvening] = useState('20:00')
  const [bpSkipped, setBpSkipped] = useState(false)
  const [meds, setMeds] = useState<MedDraft[]>([{ name: '', dose: '', time: '08:00' }])
  const [textSize, setTextSize] = useState<TextSize>('normal')
  const [appearance, setAppearance] = useState<Appearance>('system')
  const [reduceMotion, setReduceMotion] = useState(false)
  const [caregiverName, setCaregiverName] = useState('')
  const [caregiverRel, setCaregiverRel] = useState('')

  // Already finished? Don't show setup again.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const { data } = await supabase
        .from('profiles')
        .select('onboarding_state')
        .eq('id', user.id)
        .single()
      const status = (data?.onboarding_state as { status?: string } | null)
        ?.status
      if (status === 'done' && !cancelled) router.replace('/home')
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  // Live-apply comfort settings so the user sees them immediately.
  useEffect(() => {
    applyThemePrefs({ appearance, text_size: textSize, reduce_motion: reduceMotion })
  }, [appearance, textSize, reduceMotion])

  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const goBack = () => setStep((s) => Math.max(s - 1, 0))

  const finish = async () => {
    setSaving(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      await supabase.from('profiles').upsert(
        {
          id: user.id,
          name: name.trim() || null,
          text_size: textSize,
          appearance,
          reduce_motion: reduceMotion,
          onboarding_state: {
            status: 'done',
            step: STEPS.length,
            ...(bpSkipped
              ? {}
              : { bp_morning_time: bpMorning, bp_evening_time: bpEvening }),
          },
        },
        { onConflict: 'id' }
      )

      const medRows = meds
        .filter((m) => m.name.trim())
        .map((m) => ({
          user_id: user.id,
          name: m.name.trim(),
          dose: m.dose.trim() || null,
          time: m.time || '08:00',
        }))
      if (medRows.length > 0) {
        await supabase.from('medications').insert(medRows)
      }

      if (caregiverName.trim()) {
        await supabase.from('caregiver_permissions').insert({
          user_id: user.id,
          name: caregiverName.trim(),
          relationship: caregiverRel.trim() || null,
          permissions: ['view'],
        })
      }

      applyThemePrefs({
        appearance,
        text_size: textSize,
        reduce_motion: reduceMotion,
      })
      router.push('/home')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const updateMed = (i: number, patch: Partial<MedDraft>) =>
    setMeds((ms) => ms.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  const removeMed = (i: number) =>
    setMeds((ms) => (ms.length > 1 ? ms.filter((_, idx) => idx !== i) : ms))

  const last = step === STEPS.length - 1

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Let's set things up"
        description="Five quick steps. Skip anything you'd rather do later."
      />

      {/* Progress */}
      <div aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
        <p className="mb-2 text-base font-semibold text-[var(--text-secondary)]">
          Step {step + 1} of {STEPS.length} — {STEPS[step]}
        </p>
        <div className="flex gap-2" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-2 flex-1 rounded-full ${
                i <= step ? 'bg-[var(--primary)]' : 'bg-[var(--surface-secondary)]'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step 1: name */}
      {step === 0 && (
        <Card>
          <div className="flex flex-col gap-5">
            <p className="text-lg text-[var(--text-secondary)]">
              What should we call you? This is optional — the app works fine
              without it.
            </p>
            <Input
              label="Your first name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Robert"
              autoComplete="given-name"
            />
          </div>
        </Card>
      )}

      {/* Step 2: BP schedule */}
      {step === 1 && (
        <Card>
          <div className="flex flex-col gap-5">
            <p className="text-lg text-[var(--text-secondary)]">
              When do you usually take your blood pressure? We&rsquo;ll gently
              remind you around these times.
            </p>
            <Input
              label="Morning reading time"
              type="time"
              value={bpMorning}
              onChange={(e) => setBpMorning(e.target.value)}
            />
            <Input
              label="Evening reading time"
              type="time"
              value={bpEvening}
              onChange={(e) => setBpEvening(e.target.value)}
            />
          </div>
        </Card>
      )}

      {/* Step 3: medications */}
      {step === 2 && (
        <Card>
          <div className="flex flex-col gap-5">
            <p className="text-lg text-[var(--text-secondary)]">
              List your blood pressure medications. You can add more later, or
              skip this for now.
            </p>
            {meds.map((med, i) => (
              <div
                key={i}
                className="flex flex-col gap-4 rounded-[var(--radius)] border border-[var(--border)] p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-lg font-bold">Medication {i + 1}</p>
                  {meds.length > 1 && (
                    <Button
                      variant="ghost"
                      onClick={() => removeMed(i)}
                      aria-label={`Remove medication ${i + 1}`}
                    >
                      <Icon name="x" className="h-5 w-5" />
                      Remove
                    </Button>
                  )}
                </div>
                <Input
                  label="Medication name"
                  value={med.name}
                  onChange={(e) => updateMed(i, { name: e.target.value })}
                  placeholder="e.g. Amlodipine"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Dose (optional)"
                    value={med.dose}
                    onChange={(e) => updateMed(i, { dose: e.target.value })}
                    placeholder="e.g. 5 mg"
                  />
                  <Input
                    label="Time"
                    type="time"
                    value={med.time}
                    onChange={(e) => updateMed(i, { time: e.target.value })}
                  />
                </div>
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={() =>
                setMeds((ms) => [...ms, { name: '', dose: '', time: '08:00' }])
              }
            >
              <Icon name="plus" className="h-5 w-5" />
              Add another medication
            </Button>
          </div>
        </Card>
      )}

      {/* Step 4: comfort & readability */}
      {step === 3 && (
        <Card>
          <div className="flex flex-col gap-6">
            <p className="text-lg text-[var(--text-secondary)]">
              Make the app comfortable for your eyes. You can change these any
              time in Settings.
            </p>
            <fieldset>
              <legend className="mb-2 text-lg font-semibold">Text size</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {TEXT_SIZES.map((t) => (
                  <label
                    key={t.value}
                    className={`flex min-h-[var(--tap-target)] cursor-pointer flex-col justify-center gap-1 rounded-[var(--radius)] border p-4 ${
                      textSize === t.value
                        ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="text-size"
                      className="sr-only"
                      checked={textSize === t.value}
                      onChange={() => setTextSize(t.value)}
                    />
                    <span className="text-lg font-bold">{t.label}</span>
                    <span className="text-base text-[var(--text-secondary)]">
                      {t.hint}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-lg font-semibold">Look</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {APPEARANCES.map((a) => (
                  <label
                    key={a.value}
                    className={`flex min-h-[var(--tap-target)] cursor-pointer items-center justify-center rounded-[var(--radius)] border p-3 text-center ${
                      appearance === a.value
                        ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="appearance"
                      className="sr-only"
                      checked={appearance === a.value}
                      onChange={() => setAppearance(a.value)}
                    />
                    <span className="text-base font-semibold">{a.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Toggle
              checked={reduceMotion}
              onChange={setReduceMotion}
              label="Reduce motion"
              description="Turn off animations and transitions."
            />
          </div>
        </Card>
      )}

      {/* Step 5: caregiver */}
      {step === 4 && (
        <Card>
          <div className="flex flex-col gap-5">
            <p className="text-lg text-[var(--text-secondary)]">
              Would you like a family member or caregiver to be able to see your
              health information? Completely optional.
            </p>
            <Input
              label="Caregiver name (optional)"
              value={caregiverName}
              onChange={(e) => setCaregiverName(e.target.value)}
              placeholder="e.g. Sarah"
              autoComplete="off"
            />
            <Input
              label="Relationship (optional)"
              value={caregiverRel}
              onChange={(e) => setCaregiverRel(e.target.value)}
              placeholder="e.g. Daughter"
              autoComplete="off"
            />
            <p className="text-base text-[var(--text-secondary)]">
              They will be able to view your information. You can change or
              remove this any time.
            </p>
          </div>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div>
          {step > 0 && (
            <Button variant="secondary" onClick={goBack} disabled={saving}>
              Back
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          {!last ? (
            <>
              <Button
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  if (step === 1) setBpSkipped(true)
                  goNext()
                }}
              >
                Skip this step
              </Button>
              <Button onClick={goNext} disabled={saving}>
                Continue
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" disabled={saving} onClick={finish}>
                Skip
              </Button>
              <Button onClick={finish} disabled={saving}>
                {saving ? 'Finishing…' : 'Finish setup'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
