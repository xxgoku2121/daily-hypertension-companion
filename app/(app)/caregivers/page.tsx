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
  fmtDateTime,
  inputCls,
  btnPrimary,
  btnSecondary,
} from '../_ui'

const PERMISSION_OPTIONS = [
  { value: 'view_bp', label: 'View blood pressure' },
  { value: 'view_medications', label: 'View medications' },
  { value: 'view_appointments', label: 'View appointments' },
  { value: 'view_reports', label: 'View reports' },
  { value: 'receive_alerts', label: 'Receive alerts' },
]

interface Caregiver {
  id: string
  name: string
  relationship: string | null
  permissions: string[]
  active: boolean
}

interface AuditRow {
  id: string
  caregiver_name: string
  action: string
  created_at: string
}

function permLabel(v: string) {
  return PERMISSION_OPTIONS.find((p) => p.value === v)?.label || v
}

export default function CaregiversPage() {
  const profile = useProfile()
  const [caregivers, setCaregivers] = useState<Caregiver[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [perms, setPerms] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const r = await api<{ caregivers: Caregiver[]; audit: AuditRow[] }>('/api/caregivers')
      setCaregivers(r.caregivers)
      setAudit(r.audit)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load caregivers.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  function togglePerm(v: string) {
    setPerms((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]))
  }

  async function add() {
    if (!name.trim()) {
      setError('Please give the caregiver a name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api('/api/caregivers', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), relationship: relationship.trim() || null, permissions: perms }),
      })
      setName(''); setRelationship(''); setPerms([]); setShowForm(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the caregiver.')
    } finally {
      setBusy(false)
    }
  }

  async function setActive(c: Caregiver, active: boolean) {
    try {
      await api('/api/caregivers', { method: 'PATCH', body: JSON.stringify({ id: c.id, active }) })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the caregiver.')
    }
  }

  return (
    <main className={`mx-auto max-w-3xl px-4 py-8 ${textSizeClass(profile?.text_size)}`}>
      <PageHeader
        title="Caregivers"
        subtitle="Choose who can see your health information, and exactly what they can see. Every change is recorded below."
        right={
          <button className={btnPrimary} onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Close' : '+ Add caregiver'}
          </button>
        }
      />
      <ErrorNote message={error} />

      {showForm && (
        <Card className="mb-6">
          <SectionTitle>Add a caregiver</SectionTitle>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maria" className={inputCls} />
              </Field>
              <Field label="Relationship (optional)">
                <input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="e.g. Daughter" className={inputCls} />
              </Field>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">They may:</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PERMISSION_OPTIONS.map((p) => (
                  <label key={p.value} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 font-semibold text-slate-800 cursor-pointer">
                    <input type="checkbox" checked={perms.includes(p.value)} onChange={() => togglePerm(p.value)} className="h-6 w-6" />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <button className={btnPrimary} disabled={busy} onClick={add}>
                {busy ? 'Saving…' : 'Add caregiver'}
              </button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : caregivers.length === 0 ? (
        <EmptyState>
          <p className="font-semibold text-slate-800 mb-1">No caregivers yet</p>
          <p>Add a family member or friend you trust, and choose what they may see.</p>
        </EmptyState>
      ) : (
        <div className="space-y-3 mb-8">
          {caregivers.map((c) => (
            <Card key={c.id} className={!c.active ? 'opacity-70' : ''}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-slate-900">
                    {c.name}
                    {c.relationship && <span className="font-normal text-slate-500"> · {c.relationship}</span>}
                    {!c.active && <span className="ml-2 text-sm font-semibold text-red-700">(access revoked)</span>}
                  </p>
                  <p className="text-slate-600 text-sm mt-1">
                    {c.permissions.length ? c.permissions.map(permLabel).join(' · ') : 'No permissions'}
                  </p>
                </div>
                {c.active ? (
                  <button className={btnSecondary} onClick={() => setActive(c, false)}>
                    Revoke access
                  </button>
                ) : (
                  <button className={btnSecondary} onClick={() => setActive(c, true)}>
                    Restore access
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <SectionTitle>Activity record</SectionTitle>
        <p className="text-slate-600 text-sm mb-4">
          Every change to caregiver access is written here, so there is always a clear record.
        </p>
        {audit.length === 0 ? (
          <p className="text-slate-500">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {audit.map((a) => (
              <li key={a.id} className="py-3 flex flex-wrap justify-between gap-2">
                <p className="text-slate-800">
                  <span className="font-semibold">{a.caregiver_name}</span> —{' '}
                  {a.action === 'added' ? 'was added' : a.action === 'revoked' ? 'access was revoked' : a.action === 'reinstated' ? 'access was restored' : 'was updated'}
                </p>
                <p className="text-sm text-slate-500">{fmtDateTime(a.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  )
}
