import Link from 'next/link'
import { Logo } from '@/components/Logo'

/* Calm, on-brand "page not found" — never the stark default 404. */

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <Logo size={64} sub="Your daily health companion" />
        <p className="mt-2 text-6xl font-extrabold text-[var(--text-secondary)]" aria-hidden="true">
          ···
        </p>
        <h1 className="text-3xl font-extrabold text-[var(--text-primary)]">
          This page wandered off
        </h1>
        <p className="text-lg text-[var(--text-secondary)]">
          The page you&apos;re looking for isn&apos;t here. Let&apos;s get you back
          to familiar ground.
        </p>
        <div className="mt-2 flex w-full flex-col gap-3">
          <Link
            href="/home"
            className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-[var(--primary)] px-6 text-lg font-bold text-[var(--primary-contrast)]"
          >
            Back to Home
          </Link>
          <Link
            href="/guide"
            className="flex min-h-[56px] w-full items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 text-lg font-bold text-[var(--text-primary)]"
          >
            Ask the Health Guide
          </Link>
        </div>
      </div>
    </main>
  )
}
