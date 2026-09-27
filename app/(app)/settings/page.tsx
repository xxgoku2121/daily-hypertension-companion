'use client'

import { useEffect, useState } from 'react'
import {
  api,
  useSaved,
  useProfile,
  textSizeClass,
  PageHeader,
  Card,
  SectionTitle,
  Toggle,
  ErrorNote,
  btnDanger,
  btnSecondary,
} from '../_ui'

const APPEARANCES = [
  { value: 'system', label: 'System (follows your device)' },
  { value: 'light', label: 'Light' },
  { value: 'blue', label: 'Blue' },
  { value: 'dark', label: 'Dark' },
  { value: 'high_contrast', label: 'High contrast' },
]

const TEXT_SIZES = [
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Large' },
  { value: 'extra_large', label: 'Extra large' },
]

const GUIDE_PERMISSIONS = [
  { value: 'blood_pressure', label: 'Blood pressure', description: 'Let the Health Guide see your readings.' },
  { value: 'medication', label: 'Medications', description: 'Let the Health Guide see your medicines and doses taken.' },
  { value: 'food', label: 'Food', description: 'Let the Health Guide see your meals and sodium.' },
  { value: 'activity', label: 'Activity', description: 'Let the Health Guide see your walks and steps.' },
  { value: 'sleep', label: 'Sleep', description: 'Let the Health Guide see your sleep hours.' },
  { value: 'symptoms', label: 'Symptoms & check-ins', description: 'Let the Health Guide see your stress check-ins.' },
]

export default function SettingsPage() {
  const profile = useProfile()
  const saved = useSaved()
  const [form, setForm] = useState<Record<string, any> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile && !form) setForm({ ...profile })
  }, [profile, form])

  async function patchField(field: string, value: unknown) {
    setForm((f) => (f ? { ...f, [field]: value } : f))
    setSaving(true)
    setError(null)
    try {
      const r = await api<{ profile: Record<string, any> }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ [field]: value }),
      })
      setForm({ ...r.profile })
      saved.show()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ---- danger zone ----
  const [showFresh, setShowFresh] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [busy, setBusy] = useState(false)

  async function startFresh() {
    setBusy(true)
    setError(null)
    try {
      await api('/api/account', { method: 'POST', body: JSON.stringify({ action: 'fresh_start' }) })
      window.location.href = '/'
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start fresh.')
      setBusy(false)
    }
  }

  async function deleteAccount() {
    setBusy(true)
    setError(null)
    try {
      await api('/api/account', { method: 'DELETE' })
      window.location.href = '/login'
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete your account.')
      setBusy(false)
    }
  }

  return (
    <main className={`mx-auto max-w-3xl px-4 py-8 ${textSizeClass(profile?.text_size)}`}>
      <PageHeader title="Settings" subtitle="Make the app look and behave the way you like. Everything saves on its own." right={saved.el} />
      <ErrorNote message={error} />
      {saving && <p className="text-sm text-text-secondary mb-4">Saving…</p>}

      {!form ? (
        <p className="text-text-secondary">Loading your settings…</p>
      ) : (
        <div className="space-y-6">
          {/* Appearance */}
          <Card>
            <SectionTitle>Appearance</SectionTitle>
            <div className="space-y-2" role="radiogroup" aria-label="Appearance">
              {APPEARANCES.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  role="radio"
                  aria-checked={form.appearance === a.value}
                  onClick={() => patchField('appearance', a.value)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left font-semibold ${
                    form.appearance === a.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-primary hover:bg-surface-secondary'
                  }`}
                >
                  {a.label}
                  {form.appearance === a.value && <span aria-hidden>✓</span>}
                </button>
              ))}
            </div>
          </Card>

          {/* Text size */}
          <Card>
            <SectionTitle>Text size</SectionTitle>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Text size">
              {TEXT_SIZES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={form.text_size === t.value}
                  onClick={() => patchField('text_size', t.value)}
                  className={`rounded-xl border px-5 py-3 font-semibold ${
                    form.text_size === t.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-primary hover:bg-surface-secondary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <Toggle
                checked={!!form.reduce_motion}
                onChange={(v) => patchField('reduce_motion', v)}
                label="Reduce motion"
                description="Turns off animations and moving effects."
              />
            </div>
          </Card>

          {/* Health Guide data permissions */}
          <Card>
            <SectionTitle>Health Guide privacy</SectionTitle>
            <p className="text-text-secondary mb-4">
              Choose exactly what your Health Guide is allowed to look at. It cannot see anything you turn off.
            </p>
            <div className="space-y-2">
              {GUIDE_PERMISSIONS.map((p) => {
                const perms: string[] = form.guide_permissions || []
                const on = perms.includes(p.value)
                return (
                  <Toggle
                    key={p.value}
                    checked={on}
                    label={p.label}
                    description={p.description}
                    onChange={(v) => {
                      const next = v ? [...perms, p.value] : perms.filter((x) => x !== p.value)
                      patchField('guide_permissions', next)
                    }}
                  />
                )
              })}
            </div>
            <div className="mt-4">
              <Toggle
                checked={!!form.ai_history}
                onChange={(v) => patchField('ai_history', v)}
                label="Keep Health Guide chat history"
                description="When off, past conversations are not used for future replies."
              />
            </div>
          </Card>

          {/* Notifications */}
          <Card>
            <SectionTitle>Notifications</SectionTitle>
            <Toggle
              checked={!!form.notifications}
              onChange={(v) => patchField('notifications', v)}
              label="Reminders and alerts"
              description="Medication reminders, BP check reminders, and appointment alerts."
            />
          </Card>

          {/* Targets */}
          <Card>
            <SectionTitle>Daily targets</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="block text-sm font-semibold text-text-primary mb-1">Daily sodium target (mg)</span>
                <input
                  type="number"
                  min={0}
                  defaultValue={form.sodium_target}
                  onBlur={(e) => {
                    const v = Math.max(0, Math.round(Number(e.target.value) || 0))
                    if (v !== form.sodium_target) patchField('sodium_target', v)
                  }}
                  className="w-full rounded-xl border border-border px-4 py-3"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-semibold text-text-primary mb-1">Daily step target</span>
                <input
                  type="number"
                  min={0}
                  defaultValue={form.step_target}
                  onBlur={(e) => {
                    const v = Math.max(0, Math.round(Number(e.target.value) || 0))
                    if (v !== form.step_target) patchField('step_target', v)
                  }}
                  className="w-full rounded-xl border border-border px-4 py-3"
                />
              </label>
            </div>
          </Card>

          {/* My data */}
          <Card>
            <SectionTitle>My data</SectionTitle>
            <p className="text-text-secondary mb-4">Take a copy of everything you have entered. It is yours.</p>
            <div className="flex flex-wrap gap-3">
              <a className={btnSecondary} href="/api/export?format=json" download>
                Download all data (JSON)
              </a>
              <a className={btnSecondary} href="/api/export?format=csv" download>
                Download BP readings (CSV)
              </a>
            </div>
          </Card>

          {/* Danger zone */}
          <Card className="border-danger/30">
            <SectionTitle>
              <span className="text-danger">Danger zone</span>
            </SectionTitle>

            <div className="space-y-4">
              <div>
                <p className="font-semibold text-text-primary">Start fresh</p>
                <p className="text-text-secondary text-sm mb-2">
                  Deletes all of your health data — readings, medicines, meals, everything you logged —
                  but keeps your account and settings so you can begin again cleanly.
                </p>
                {!showFresh ? (
                  <button className={btnSecondary} onClick={() => setShowFresh(true)}>
                    Start fresh…
                  </button>
                ) : (
                  <div className="rounded-xl bg-danger/10 border border-danger/30 p-4">
                    <p className="font-semibold text-danger mb-3">
                      This will permanently delete all of your logged health data. Are you sure?
                    </p>
                    <div className="flex gap-3">
                      <button className={btnDanger} disabled={busy} onClick={startFresh}>
                        Yes, delete my data
                      </button>
                      <button className={btnSecondary} onClick={() => setShowFresh(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-4">
                <p className="font-semibold text-text-primary">Delete account</p>
                <p className="text-text-secondary text-sm mb-2">
                  Deletes all of your data and your profile, then signs you out. This cannot be undone.
                  To remove your sign-in itself, you can contact support afterward — your account will hold no data.
                </p>
                {!showDelete ? (
                  <button className={btnDanger} onClick={() => setShowDelete(true)}>
                    Delete my account…
                  </button>
                ) : (
                  <div className="rounded-xl bg-danger/10 border border-danger/30 p-4">
                    <p className="font-semibold text-danger mb-2">
                      Type <span className="font-mono bg-surface px-1 rounded">DELETE</span> to confirm:
                    </p>
                    <input
                      value={deleteText}
                      onChange={(e) => setDeleteText(e.target.value)}
                      placeholder="Type DELETE here"
                      className="w-full rounded-xl border border-border px-4 py-3 mb-3"
                    />
                    <div className="flex gap-3">
                      <button
                        className={btnDanger}
                        disabled={busy || deleteText.trim().toUpperCase() !== 'DELETE'}
                        onClick={deleteAccount}
                      >
                        Permanently delete my account
                      </button>
                      <button className={btnSecondary} onClick={() => { setShowDelete(false); setDeleteText('') }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </main>
  )
}
