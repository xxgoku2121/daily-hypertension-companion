import { createClient } from '@/lib/supabase/server'
import {
  Button,
  Card,
  FeelingCheck,
  Icon,
  NextStepCard,
  PageHeader,
} from '@/components/ui'

/* Simple daily Home: greeting, ONE next-step card, a short Today list,
   a feeling check-in, and the two main actions. No dashboards. */

function greetingForHour(h: number): string {
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

interface TodayItem {
  id: string
  label: string
  meta: string
  href: string
}

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const today = new Date().toISOString().slice(0, 10)
  const nowIso = new Date().toISOString()
  const greeting = greetingForHour(new Date().getHours())
  const dateStr = new Date().toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  let name: string | null = null
  let items: TodayItem[] = []

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single()
    name = profile?.name ?? null

    const [eventsRes, apptRes] = await Promise.all([
      supabase
        .from('schedule_events')
        .select('id, time, title, status')
        .eq('user_id', user.id)
        .eq('date', today)
        .order('time', { ascending: true })
        .limit(5),
      supabase
        .from('appointments')
        .select('id, title, date_time, location')
        .eq('user_id', user.id)
        .eq('status', 'upcoming')
        .gte('date_time', nowIso)
        .order('date_time', { ascending: true })
        .limit(1),
    ])

    const eventItems: TodayItem[] = ((eventsRes.data ?? []) as {
      id: string
      time: string
      title: string
      status: string
    }[]).map((e) => ({
      id: `event-${e.id}`,
      label: e.title,
      meta: `${e.time}${e.status === 'done' ? ' — done' : ''}`,
      href: '/home',
    }))

    const apptItems: TodayItem[] = ((apptRes.data ?? []) as {
      id: string
      title: string
      date_time: string
      location: string | null
    }[]).map((a) => ({
      id: `appt-${a.id}`,
      label: a.title,
      meta: `${new Date(a.date_time).toLocaleString([], {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })}${a.location ? ` — ${a.location}` : ''}`,
      href: '/appointments',
    }))

    items = [...apptItems, ...eventItems].slice(0, 5)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`${greeting}${name ? `, ${name}` : ''}`}
        description={dateStr}
      />

      <NextStepCard />

      <Card labelledBy="today-title">
        <h2 id="today-title" className="text-xl font-bold">
          Today
        </h2>
        {items.length === 0 ? (
          <p className="mt-2 text-lg text-[var(--text-secondary)]">
            Nothing scheduled for today.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-[var(--border)]">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={item.href}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">{item.label}</p>
                    <p className="text-base text-[var(--text-secondary)]">
                      {item.meta}
                    </p>
                  </div>
                  <Icon
                    name="chevronRight"
                    className="h-5 w-5 shrink-0 text-[var(--text-secondary)]"
                  />
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <FeelingCheck />

      <div className="grid gap-3 sm:grid-cols-2">
        <Button href="/guide" variant="secondary">
          <Icon name="chat" className="h-6 w-6" />
          Talk to Health Guide
        </Button>
        <Button href="/get-help" variant="danger">
          <Icon name="help" className="h-6 w-6" />
          Get Help
        </Button>
      </div>
    </div>
  )
}
