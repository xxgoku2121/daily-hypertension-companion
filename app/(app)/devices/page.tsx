'use client'

import { useEffect, useState } from 'react'
import {
  api,
  useProfile,
  textSizeClass,
  PageHeader,
  Card,
  SectionTitle,
  ErrorNote,
} from '../_ui'

interface Device {
  id: string
  kind: string
  name: string
  status: 'connected' | 'available_later' | 'disconnected'
  last_seen_at: string | null
  last_sync_at: string | null
  manufacturer: string | null
  model: string | null
}

const PLACEHOLDERS = [
  {
    name: 'Bluetooth blood pressure monitor',
    description: 'Send readings straight from your cuff — no typing needed.',
  },
  {
    name: 'Health platform sync',
    description: 'Bring in steps, sleep, and workouts from your phone’s health app.',
  },
]

export default function DevicesPage() {
  const profile = useProfile()
  const [devices, setDevices] = useState<Device[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<{ devices: Device[] }>('/api/devices')
      .then((r) => setDevices(r.devices))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load devices.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className={`mx-auto max-w-3xl px-4 py-8 ${textSizeClass(profile?.text_size)}`}>
      <PageHeader title="Devices" subtitle="Anything connected to your health data lives here." />
      <ErrorNote message={error} />

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          {devices.length > 0 && (
            <section>
              <SectionTitle>Your devices</SectionTitle>
              <div className="space-y-3">
                {devices.map((d) => (
                  <Card key={d.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-slate-900">{d.name}</p>
                        <p className="text-sm text-slate-500 capitalize">{d.kind.replace(/_/g, ' ')}</p>
                        {(d.manufacturer || d.model) && (
                          <p className="text-sm text-slate-500">{[d.manufacturer, d.model].filter(Boolean).join(' · ')}</p>
                        )}
                        {d.last_sync_at && (
                          <p className="text-sm text-slate-500">
                            Last synced {new Date(d.last_sync_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-sm font-semibold ${
                          d.status === 'connected'
                            ? 'bg-green-100 text-green-800'
                            : d.status === 'available_later'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {d.status === 'connected' ? 'Connected' : d.status === 'available_later' ? 'Coming later' : 'Not connected'}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle>Coming later</SectionTitle>
            <div className="space-y-3">
              {PLACEHOLDERS.map((p) => (
                <Card key={p.name} className="border-dashed">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-slate-900">{p.name}</p>
                      <p className="text-slate-600">{p.description}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                      Not connected
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-3">
                    This is not available yet. We will let you know when it is — nothing here pretends to connect.
                  </p>
                </Card>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
