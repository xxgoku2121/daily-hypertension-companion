'use client'

/* Sign in with email + password. On success, make sure the user's
   profile and safety-rule rows exist, then head to /home
   (the shell's onboarding guard reroutes to /onboarding when needed). */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button, Card, Input } from '@/components/ui'

async function ensureUserRows(userId: string) {
  const supabase = createClient()
  // Idempotent: safe to run on every sign-in.
  await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' })
  await supabase
    .from('safety_rules')
    .upsert({ user_id: userId }, { onConflict: 'user_id' })
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
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
      router.push('/home')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold">Daily Hypertension Companion</h1>
          <p className="mt-2 text-lg text-[var(--text-secondary)]">
            Sign in to continue your day.
          </p>
        </div>
        <Card>
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
