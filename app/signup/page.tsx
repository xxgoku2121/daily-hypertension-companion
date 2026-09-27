'use client'

/* Create an account with email + password. On signup we also insert the
   user's profiles row and safety_rules row. New accounts go to
   /onboarding (the shell guard enforces it as a backstop). */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button, Card, Input } from '@/components/ui'

async function ensureUserRows(userId: string) {
  const supabase = createClient()
  await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' })
  await supabase
    .from('safety_rules')
    .upsert({ user_id: userId }, { onConflict: 'user_id' })
}

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Please choose a password with at least 8 characters.')
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })
      if (signUpError) {
        setError(signUpError.message)
        return
      }
      if (data.user) {
        await ensureUserRows(data.user.id)
      }
      if (data.session) {
        // Signed in immediately — start setup.
        router.push('/onboarding')
        router.refresh()
      } else {
        // Email confirmation is on — ask them to confirm, then sign in.
        setNotice(
          'Account created! Please check your email to confirm it, then sign in.'
        )
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold">Create your account</h1>
          <p className="mt-2 text-lg text-[var(--text-secondary)]">
            Free to use. Your health information stays private to you.
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
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              hint="Use at least 8 characters."
            />
            <Input
              label="Repeat password"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type it again"
            />
            {error && (
              <p role="alert" className="text-lg font-semibold text-[var(--danger)]">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-lg font-semibold text-[var(--success)]">
                {notice}
              </p>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
          <p className="mt-6 text-center text-lg">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-semibold text-[var(--primary)] underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </main>
  )
}
