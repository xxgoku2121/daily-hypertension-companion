import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  Button,
  Card,
  FeelingCheck,
  Icon,
  NextStepCard,
  PageHeader,
} from '@/components/ui'
import { getTodayPlan, getAtAGlance } from '@/lib/today-plan'

/* Simple daily Home: greeting, ONE next-step card, a Today list fed by the
   same state the Next Best Action engine uses, a feeling check-in, and the
   two main actions. A quiet "At a glance" column on desktop — never a
   dashboard. */

function greetingForHour(h: number): string {
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const greeting = greetingForHour(new Date().getHours())
  const dateStr = new Date().toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  let name: string | null = null
  let plan: Awaited<ReturnType<typeof getTodayPlan>> = []
  let glance: Awaited<ReturnType<typeof getAtAGlance>> | null = null

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single()
    name = profile?.name ?? null
    ;[plan, glance] = await Promise.all([
      getTodayPlan(supabase, user.id),
      getAtAGlance(supabase, user.id),
    ])
  }

  const glanceItems: { icon: string; label: string; value: string; href: string }[] = []
  if (glance?.latestBp) {
    glanceItems.push({
      icon: '💓',
      label: 'Latest BP',
      value: `${glance.latestBp.systolic}/${glance.latestBp.diastolic} · ${glance.latestBp.when}`,
      href: '/bp',
    })
  }
  if (glance?.meds) {
    glanceItems.push({
      icon: '💊',
      label: 'Medicines',
      value:
        glance.meds.taken >= glance.meds.total
          ? `All ${glance.meds.total} taken today`
          : `${glance.meds.taken} of ${glance.meds.total} taken`,
      href: '/medications',
    })
  }
  if (glance?.movement) {
    const bits: string[] = []
    if (glance.movement.minutes != null) bits.push(`${glance.movement.minutes} min of movement`)
    if (glance.movement.steps != null) bits.push(`${glance.movement.steps.toLocaleString()} steps`)
    glanceItems.push({ icon: '🚶', label: 'Movement', value: bits.join(' · ') || '—', href: '/activity' })
  }
  if (glance?.nextAppointment) {
    glanceItems.push({
      icon: '📅',
      label: 'Next appointment',
      value: `${glance.nextAppointment.title} · ${glance.nextAppointment.when}`,
      href: '/appointments',
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
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
          {plan.length === 0 ? (
            <p className="mt-2 text-lg text-[var(--text-secondary)]">
              Nothing on your list today — enjoy the calm.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-[var(--border)]">
              {plan.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 py-3"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl ${
                        item.done
                          ? 'bg-[var(--success)]/15 text-[var(--success)]'
                          : 'bg-[var(--surface-secondary)]'
                      }`}
                      aria-hidden="true"
                    >
                      {item.done ? '✓' : item.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-lg font-semibold leading-snug ${
                          item.done ? 'text-[var(--text-secondary)] line-through' : ''
                        }`}
                      >
                        {item.label}
                      </p>
                      <p className="text-base text-[var(--text-secondary)]">{item.meta}</p>
                    </div>
                    <Icon
                      name="chevronRight"
                      className="h-5 w-5 shrink-0 text-[var(--text-secondary)]"
                    />
                  </Link>
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

      {glanceItems.length > 0 && (
        <aside aria-label="At a glance">
          <Card labelledBy="glance-title">
            <h2
              id="glance-title"
              className="text-lg font-bold uppercase tracking-wide text-[var(--text-secondary)]"
            >
              At a glance
            </h2>
            <ul className="mt-3 flex flex-col divide-y divide-[var(--border)]">
              {glanceItems.map((g) => (
                <li key={g.label}>
                  <Link href={g.href} className="flex items-center gap-3 py-3">
                    <span className="text-2xl" aria-hidden="true">
                      {g.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-[var(--text-secondary)]">
                        {g.label}
                      </p>
                      <p className="truncate text-lg font-bold">{g.value}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      )}
    </div>
  )
}
