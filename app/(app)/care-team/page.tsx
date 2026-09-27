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
  btnSecondary,
} from '../_ui'

const ROLES = ['Doctor', 'Pharmacist', 'Specialist', 'Nurse', 'Dentist', 'Therapist', 'Other']

const ROLE_ICONS: Record<string, string> = {
  Doctor: '🩺',
  Pharmacist: '💊',
  Specialist: '🔬',
  Nurse: '🩹',
  Dentist: '🦷',
  Therapist: '🧠',
  Other: '🤝',
}

interface Member {
  id: string
  role: string
  name: string
  phone: string | null
  address: string | null
  notes: string | null
}

export default function CareTeamPage() {
  const profile = useProfile()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)

  const [role, setRole] = useState('Doctor')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const r = await api<{ care_team: Member[] }>('/api/care-team')
      setMembers(r.care_team)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your care team.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  function openAdd() {
    setEditing(null)
    setRole('Doctor'); setName(''); setPhone(''); setAddress(''); setNotes('')
    setShowForm(true)
  }

  function openEdit(m: Member) {
    setEditing(m)
    setRole(m.role); setName(m.name); setPhone(m.phone || ''); setAddress(m.address || ''); setNotes(m.notes || '')
    setShowForm(true)
  }

  async function save() {
    if (!name.trim()) {
      setError('Please give the person a name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload = {
        role,
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      }
      if (editing) {
        await api('/api/care-team', { method: 'PATCH', body: JSON.stringify({ id: editing.id, ...payload }) })
      } else {
        await api('/api/care-team', { method: 'POST', body: JSON.stringify(payload) })
      }
      setShowForm(false)
      setEditing(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this person from your care team?')) return
    try {
      await fetch(`/api/care-team?id=${id}`, { method: 'DELETE' })
      load()
    } catch {
      setError('Could not remove them.')
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title="Care team"
        subtitle="Your doctor, pharmacist, and everyone who looks after your health."
        right={
          <button className={btnPrimary} onClick={openAdd}>
            + Add person
          </button>
        }
      />
      <ErrorNote message={error} />

      {showForm && (
        <Card className="mb-6">
          <SectionTitle>{editing ? 'Edit' : 'Add a care team member'}</SectionTitle>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role">
                <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <Field label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={inputCls} />
              </Field>
            </div>
            <Field label="Phone (optional)">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" inputMode="tel" className={inputCls} />
            </Field>
            <Field label="Address (optional)">
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Office address" className={inputCls} />
            </Field>
            <Field label="Notes (optional)">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
            </Field>
            <div className="flex gap-3">
              <button className={btnPrimary} disabled={busy} onClick={save}>
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Add'}
              </button>
              <button className={btnSecondary} onClick={() => { setShowForm(false); setEditing(null) }}>
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-text-secondary">Loading…</p>
      ) : (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
      {members.length === 0 ? (
        <EmptyState>
          <p className="font-semibold text-text-primary mb-1">No one here yet</p>
          <p>Add your doctor and pharmacist so their details are always handy.</p>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {members.map((m) => (
            <Card key={m.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">
                    <span aria-hidden="true" className="mr-1 text-base">{ROLE_ICONS[m.role] ?? ROLE_ICONS.Other}</span>
                    {m.role}
                  </p>
                  <p className="text-lg font-bold text-text-primary">{m.name}</p>
                  {m.phone && (
                    <p className="mt-1">
                      <a className={`${btnSecondary} no-underline`} href={`tel:${m.phone}`}>
                        📞 Call {m.phone}
                      </a>
                    </p>
                  )}
                  {m.address && <p className="text-text-secondary mt-1">{m.address}</p>}
                  {m.notes && <p className="text-text-secondary mt-1">{m.notes}</p>}
                </div>
                <div className="flex gap-2">
                  <button className={btnSecondary} onClick={() => openEdit(m)}>Edit</button>
                  <button className={btnSecondary} onClick={() => remove(m.id)}>Remove</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      </div>

      {/* RIGHT COLUMN */}
      <aside className="space-y-6" aria-label="About your care team">
        <Card>
          <SectionTitle>👪 Caregiver access</SectionTitle>
          <p className="text-lg text-text-secondary">
            A family member or caregiver can view your health summary and get safety alerts — only what you allow.
          </p>
          <Link href="/caregivers" className={`${btnSecondary} mt-3 justify-center`}>
            Manage caregiver access
          </Link>
        </Card>
        <Card>
          <SectionTitle>🆘 In an emergency</SectionTitle>
          <p className="text-lg text-text-secondary">
            Call your local emergency number first. Your care team list is for routine contact, not emergencies.
          </p>
          <Link href="/get-help" className={`${btnSecondary} mt-3 justify-center`}>
            Find help near me
          </Link>
        </Card>
      </aside>
      </div>
      )}
    </main>
  )
}
