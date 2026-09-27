import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button, Card, Icon } from '@/components/ui'
import { Logo } from '@/components/Logo'

/* Public front page for Steady. Signed-in visitors go straight to /home;
   everyone else gets a calm introduction and a clear path to sign up. */

const FEATURES = [
  {
    icon: 'check',
    title: 'One clear next step',
    text: 'Open the app and see exactly what to do next. Nothing to figure out.',
  },
  {
    icon: 'heart',
    title: 'Blood pressure tracking',
    text: 'Log a reading in seconds and watch your trend over time.',
  },
  {
    icon: 'pill',
    title: 'Medicine reminders',
    text: 'Gentle reminders and refill alerts for every prescription.',
  },
  {
    icon: 'chat',
    title: 'A guide that explains why',
    text: 'Ask health questions and always see the evidence behind the answer.',
  },
]

export default async function LandingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/home')
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo size={76} sub="Daily Hypertension Companion" />
          <h1 className="mt-2 max-w-xl text-4xl font-extrabold leading-tight sm:text-5xl">
            A calmer way to look after your blood pressure.
          </h1>
          <p className="max-w-lg text-xl text-[var(--text-secondary)]">
            Steady keeps track of the small daily things — readings, medicine,
            habits — so you can just live your life.
          </p>
        </div>

        <div className="mt-8 flex w-full max-w-md flex-col gap-3">
          <Button href="/signup" className="w-full">
            Create a free account
          </Button>
          <Button href="/login" variant="secondary" className="w-full">
            Sign in
          </Button>
        </div>

        <div className="mt-12 grid w-full gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <Card key={f.title} className="flex flex-col gap-2">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
                <Icon name={f.icon} className="h-6 w-6" />
              </span>
              <h2 className="text-xl font-bold">{f.title}</h2>
              <p className="text-lg text-[var(--text-secondary)]">{f.text}</p>
            </Card>
          ))}
        </div>

        <p className="mt-10 text-center text-base text-[var(--text-secondary)]">
          Free to use · Your health information stays private to you
        </p>
      </div>
    </main>
  )
}
