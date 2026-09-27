'use client'

/* Discreet site-feedback entry point. A quiet trigger button opens a small
   modal (the shared Modal primitive) with a category select and a message
   box. Posts to POST /api/feedback with { category, message, page }.
   Theme-aware via the app theme tokens; senior-friendly sizing.
   Hidden during onboarding so setup stays distraction-free. */

import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button, Icon, Modal, Select } from './ui'

const CATEGORIES = [
  { value: 'suggestion', label: 'Suggestion — an idea to improve the app' },
  { value: 'problem', label: 'Problem — something is not working' },
  { value: 'praise', label: 'Praise — something you like' },
  { value: 'other', label: 'Other' },
]

const MAX_LENGTH = 2000

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function FeedbackButton({
  variant = 'sidebar',
}: {
  /** 'sidebar': quiet text button for the desktop sidebar.
      'floating': small unobtrusive pill for mobile, above the bottom nav. */
  variant?: 'sidebar' | 'floating'
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('suggestion')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messageId = useId()

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  // Keep setup focused: no feedback entry point during onboarding.
  if (pathname === '/onboarding') return null

  const openModal = () => {
    setStatus('idle')
    setError(null)
    setOpen(true)
  }

  const closeModal = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(false)
  }

  const send = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = message.trim()
    if (!trimmed || status === 'sending') return
    setStatus('sending')
    setError(null)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          message: trimmed.slice(0, MAX_LENGTH),
          page: pathname,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
      }
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' && data.error
            ? data.error
            : 'We could not save that. Please try again.'
        )
      }
      setStatus('sent')
      setMessage('')
      closeTimer.current = setTimeout(() => setOpen(false), 2400)
    } catch (err) {
      setStatus('error')
      setError(
        err instanceof Error
          ? err.message
          : 'We could not save that. Please try again.'
      )
    }
  }

  const trigger =
    variant === 'floating' ? (
      <button
        type="button"
        onClick={openModal}
        aria-haspopup="dialog"
        className="fixed bottom-20 right-4 z-40 flex min-h-[48px] items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-base font-semibold text-[var(--text-secondary)] lg:hidden"
        style={{ boxShadow: 'var(--shadow)' }}
      >
        <Icon name="chat" className="h-5 w-5" />
        Feedback
      </button>
    ) : (
      <button
        type="button"
        onClick={openModal}
        aria-haspopup="dialog"
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[var(--radius)] px-4 py-2 text-base text-[var(--sidebar-text-dim)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text)]"
      >
        <Icon name="chat" className="h-5 w-5" />
        Give feedback
      </button>
    )

  return (
    <>
      {trigger}
      <Modal open={open} onClose={closeModal} title="Give feedback">
        {status === 'sent' ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--success)]/10 text-[var(--success)]">
              <Icon name="check" className="h-8 w-8" />
            </span>
            <p className="text-xl font-bold">
              Thanks — your idea helps us keep improving.
            </p>
          </div>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-5">
            <Select
              label="What is this about?"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={messageId} className="text-lg font-semibold">
                Your message
              </label>
              <textarea
                id={messageId}
                rows={5}
                maxLength={MAX_LENGTH}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what's on your mind…"
                className="min-h-[120px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-lg text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
              />
              <p className="text-right text-sm text-[var(--text-secondary)]">
                {message.length}/{MAX_LENGTH}
              </p>
            </div>
            {status === 'error' && error && (
              <p
                role="alert"
                className="text-lg font-semibold text-[var(--danger)]"
              >
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={status === 'sending' || !message.trim()}
              className="w-full"
            >
              {status === 'sending' ? 'Sending…' : 'Send'}
            </Button>
          </form>
        )}
      </Modal>
    </>
  )
}
