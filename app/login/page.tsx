'use client'

/* Sign in with email + password. On success, make sure the user's
   profile and safety-rule rows exist, then head to /home
   (the shell's onboarding guard reroutes to /onboarding when needed).
   The email address is remembered on this device so returning users
   don't have to type it again after signing out. */

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button, Card, Input } from '@/components/ui'
import { Logo } from '@/components/Logo'

const LAST_EMAIL_KEY = 'steady.lastEmail'

function loadLastEmail(): string {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveLastEmail(email: string) {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email)
  } catch {
    /* storage unavailable — sign-in still works */
  }
}

async function ensureUserRows(userId: string) {
  const supabase = createClient()
  // Idempotent: safe to run on every sign-in.
  await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' })
  await supabase
    .from('safety_rules')
    .upsert({ user_id: userId }, { onConflict: 'user_id' })
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

/** Shows a friendly note when an email-confirmation link could not be completed. */
function ConfirmErrorNote() {
  const params = useSearchParams()
  if (params.get('error') !== 'confirm') return null
  return (
    <p role="alert" className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-lg text-[var(--text-primary)]">
      That confirmation link didn&apos;t work — it may have expired. Please sign in below,
      or request a new confirmation email.
    </p>
  )
}

function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState(loadLastEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
      if (signInError) {
        setError(
          signInError.message === 'Invalid login credentials'
            ? 'That email and password did not match. Please try again.'
            : signInError.message
        )
        return
      }
      if (data.user) {
        await ensureUserRows(data.user.id)
      }
      saveLastEmail(email.trim())
      router.push('/home')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-4 text-center">
          <Logo size={60} sub="Daily Hypertension Companion" />
          <div>
            <h1 className="text-3xl font-bold">Welcome back</h1>
            <p className="mt-2 text-lg text-[var(--text-secondary)]">
              Sign in to continue your day.
            </p>
          </div>
        </div>
        <Card>
          <ConfirmErrorNote />
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
            />
            {error && (
              <p role="alert" className="text-lg font-semibold text-[var(--danger)]">
                {error}
              </p>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="text-center text-base text-[var(--text-secondary)]">
              Your email is remembered on this device to make signing in
              easier.
            </p>
          </form>
          <p className="mt-6 text-center text-lg">
            New here?{' '}
            <Link
              href="/signup"
              className="font-semibold text-[var(--primary)] underline underline-offset-4"
            >
              Create an account
            </Link>
          </p>
        </Card>
      </div>
    </main>
  )
}
