'use client'

// Health Guide chat screen.
// Senior-first: large text, big tap targets, plain language, no raw errors.
// Uses the app's semantic theme tokens (var(--...)) so themes keep working.
// Does not depend on sibling-owned UI modules.

import { useCallback, useEffect, useRef, useState } from 'react'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  safety?: boolean
  /** Attached photo (data URL), shown in the user's own bubble. Not persisted. */
  photo?: string
}

interface EvidenceView {
  id: string
  source_name: string
  source_title: string | null
  source_url: string
  published_date: string | null
}

interface ActionProposal {
  action_id: string
  label: string
  description: string
}

type ProposalState = 'pending' | 'working' | 'done' | 'cancelled' | 'error'

interface ProposalCard {
  proposal: ActionProposal
  state: ProposalState
  note: string
}

interface GuideMeta {
  name: string | null
  has_medications: boolean
  has_craving_history: boolean
}

// Minimal Web Speech API typing (feature-detected at runtime).
interface SpeechRecognizer {
  lang: string
  interimResults: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}
type SpeechRecognizerCtor = new () => SpeechRecognizer

function getSpeechRecognizerCtor(): SpeechRecognizerCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognizerCtor
    webkitSpeechRecognition?: SpeechRecognizerCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const FRIENDLY_ERROR = 'Something went wrong on my side. Please try again in a moment.'

export default function GuidePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [evidenceByMsg, setEvidenceByMsg] = useState<Record<string, EvidenceView[]>>({})
  const [cardsByMsg, setCardsByMsg] = useState<Record<string, ProposalCard[]>>({})
  const [openSources, setOpenSources] = useState<Record<string, boolean>>({})
  const [meta, setMeta] = useState<GuideMeta | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const listRef = useRef<HTMLDivElement>(null)
  const recognizerRef = useRef<SpeechRecognizer | null>(null)

  // ---- load history + meta ----
  useEffect(() => {
    setVoiceSupported(getSpeechRecognizerCtor() !== null)
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/guide')
        const data = await res.json()
        if (cancelled) return
        if (res.ok) {
          setMessages(
            (data.messages ?? []).map(
              (m: { id: string; role: string; content: string }): ChatMessage => ({
                id: m.id,
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content,
              })
            )
          )
          setMeta(data.meta ?? null)
        } else {
          setError(FRIENDLY_ERROR)
        }
      } catch {
        if (!cancelled) setError(FRIENDLY_ERROR)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // ---- auto-scroll ----
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, cardsByMsg])

  // ---- send ----
  const MAX_PHOTO_BYTES = 4 * 1024 * 1024

  const handlePhotoFile = useCallback((file: File | undefined) => {
    setPhotoError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose a photo file (JPG or PNG).')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('That photo is too large. Please pick one under 4 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setPhoto(reader.result)
    }
    reader.onerror = () => setPhotoError('Could not read that photo. Please try another.')
    reader.readAsDataURL(file)
  }, [])

  const sendMessage = useCallback(
    async (text: string, photoDataUrl?: string | null) => {
      const trimmed = text.trim()
      const attachedPhoto = photoDataUrl ?? null
      if ((!trimmed && !attachedPhoto) || sending) return
      setInput('')
      setPhoto(null)
      setPhotoError(null)
      setError(null)
      setSending(true)
      const displayText = trimmed || '📷 Photo'
      const tempId = `local-user-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        { id: tempId, role: 'user', content: displayText, photo: attachedPhoto ?? undefined },
      ])
      try {
        const res = await fetch('/api/guide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            pageContext: 'guide',
            image: attachedPhoto,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(typeof data?.error === 'string' ? data.error : FRIENDLY_ERROR)
          return
        }
        const assistantId: string = data.message_id ?? `local-assistant-${Date.now()}`
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: 'assistant',
            content: typeof data.reply === 'string' ? data.reply : "I'm here — please try asking again.",
            safety: data.safety === true,
          },
        ])
        if (Array.isArray(data.evidence) && data.evidence.length > 0) {
          setEvidenceByMsg((prev) => ({ ...prev, [assistantId]: data.evidence }))
        }
        if (Array.isArray(data.actions) && data.actions.length > 0) {
          setCardsByMsg((prev) => ({
            ...prev,
            [assistantId]: data.actions.map((a: ActionProposal) => ({
              proposal: a,
              state: 'pending' as ProposalState,
              note: '',
            })),
          }))
        }
      } catch {
        setError(FRIENDLY_ERROR)
      } finally {
        setSending(false)
      }
    },
    [sending]
  )

  // ---- confirm / cancel an action ----
  const answerAction = useCallback(
    async (msgId: string, actionId: string, confirmed: boolean) => {
      setCardsByMsg((prev) => ({
        ...prev,
        [msgId]: (prev[msgId] ?? []).map((c) =>
          c.proposal.action_id === actionId ? { ...c, state: 'working', note: '' } : c
        ),
      }))
      try {
        const res = await fetch('/api/guide/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_id: actionId, confirmed }),
        })
        const data = await res.json()
        setCardsByMsg((prev) => ({
          ...prev,
          [msgId]: (prev[msgId] ?? []).map((c) => {
            if (c.proposal.action_id !== actionId) return c
            if (res.ok && data.ok) {
              return {
                ...c,
                state: data.status === 'cancelled' ? ('cancelled' as ProposalState) : ('done' as ProposalState),
                note: typeof data.message === 'string' ? data.message : '',
              }
            }
            return {
              ...c,
              state: 'error' as ProposalState,
              note: typeof data?.error === 'string' ? data.error : FRIENDLY_ERROR,
            }
          }),
        }))
      } catch {
        setCardsByMsg((prev) => ({
          ...prev,
          [msgId]: (prev[msgId] ?? []).map((c) =>
            c.proposal.action_id === actionId
              ? { ...c, state: 'error' as ProposalState, note: FRIENDLY_ERROR }
              : c
          ),
        }))
      }
    },
    []
  )

  // ---- voice input ----
  const toggleListening = useCallback(() => {
    const Ctor = getSpeechRecognizerCtor()
    if (!Ctor) return
    if (listening) {
      recognizerRef.current?.stop()
      setListening(false)
      return
    }
    try {
      const rec = new Ctor()
      rec.lang = 'en-US'
      rec.interimResults = false
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript
        if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript))
      }
      rec.onend = () => {
        setListening(false)
        recognizerRef.current = null
      }
      rec.onerror = () => {
        setListening(false)
        recognizerRef.current = null
      }
      recognizerRef.current = rec
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }, [listening])

  useEffect(() => {
    return () => {
      try {
        recognizerRef.current?.stop()
      } catch {
        // ignore
      }
    }
  }, [])

  const toggleSources = (msgId: string) =>
    setOpenSources((prev) => ({ ...prev, [msgId]: !prev[msgId] }))

  const firstName = meta?.name ? meta.name.split(' ')[0] : null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">AI Chat</h1>
        <p className="mt-1 text-lg text-[var(--text-secondary)]">
          {firstName
            ? `Hi ${firstName} — ask your Health Guide anything about your health, in your own words.`
            : 'Ask your Health Guide anything about your health, in your own words.'}
        </p>
      </header>

      {/* message list */}
      <div
        ref={listRef}
        role="log"
        aria-label="Conversation with Health Guide"
        className="flex min-h-[40dvh] max-h-[62dvh] flex-col gap-4 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
      >
        {loading && (
          <p className="text-lg text-[var(--text-secondary)]">Loading your conversation…</p>
        )}
        {!loading && messages.length === 0 && (
          <div className="text-lg text-[var(--text-secondary)]">
            <p className="font-semibold text-[var(--text-primary)]">Welcome to your Health Guide.</p>
            <p className="mt-2">
              I can help you figure out your next step, answer blood pressure questions, and
              handle medicines and reminders. You can also send a photo — for example of a
              meal or a medicine label. Try one of the suggestions below, or just type.
            </p>
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-[var(--primary)] px-5 py-3 text-lg text-[var(--primary-contrast)]">
                {m.photo && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={m.photo}
                    alt="Photo you sent"
                    className="mb-2 max-h-48 rounded-xl object-cover"
                  />
                )}
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-start">
              <div
                className={`max-w-[90%] rounded-2xl px-5 py-3 text-lg ${
                  m.safety
                    ? 'border-2 border-[var(--danger)] bg-[var(--surface-secondary)] text-[var(--text-primary)]'
                    : 'bg-[var(--surface-secondary)] text-[var(--text-primary)]'
                }`}
              >
                {m.safety && (
                  <p className="mb-2 font-bold text-[var(--danger)]">Please read this carefully</p>
                )}
                <p className="whitespace-pre-wrap">{m.content}</p>

                {/* Why? / Sources */}
                {evidenceByMsg[m.id] && evidenceByMsg[m.id].length > 0 && (
                  <div className="mt-3 border-t border-[var(--border)] pt-2">
                    <button
                      type="button"
                      onClick={() => toggleSources(m.id)}
                      aria-expanded={openSources[m.id] === true}
                      className="min-h-[44px] text-base font-semibold text-[var(--primary)] underline"
                    >
                      {openSources[m.id] ? 'Hide sources' : `Why? / Sources (${evidenceByMsg[m.id].length})`}
                    </button>
                    {openSources[m.id] && (
                      <ul className="mt-2 flex flex-col gap-2 text-base">
                        {evidenceByMsg[m.id].map((e) => (
                          <li key={e.id} className="rounded-lg bg-[var(--surface)] p-3">
                            <p className="font-semibold">{e.source_name}</p>
                            {e.source_title && <p>{e.source_title}</p>}
                            {e.published_date && (
                              <p className="text-[var(--text-secondary)]">
                                Published {e.published_date}
                              </p>
                            )}
                            <a
                              href={e.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[var(--primary)] underline"
                            >
                              Open source
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* confirmation cards */}
                {(cardsByMsg[m.id] ?? []).map((card) => (
                  <div
                    key={card.proposal.action_id}
                    className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
                  >
                    <p className="text-lg font-semibold text-[var(--text-primary)]">
                      {card.proposal.label}
                    </p>
                    {card.proposal.description && (
                      <p className="mt-1 text-base text-[var(--text-secondary)]">
                        {card.proposal.description}
                      </p>
                    )}
                    {card.state === 'pending' && (
                      <div className="mt-3 flex gap-3">
                        <button
                          type="button"
                          onClick={() => answerAction(m.id, card.proposal.action_id, true)}
                          className="min-h-[48px] flex-1 rounded-xl bg-[var(--primary)] px-4 text-lg font-semibold text-[var(--primary-contrast)]"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => answerAction(m.id, card.proposal.action_id, false)}
                          className="min-h-[48px] flex-1 rounded-xl border border-[var(--border)] px-4 text-lg font-semibold text-[var(--text-primary)]"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    {card.state === 'working' && (
                      <p className="mt-3 text-base text-[var(--text-secondary)]">Working on it…</p>
                    )}
                    {(card.state === 'done' || card.state === 'cancelled') && card.note && (
                      <p className="mt-3 text-base font-medium text-[var(--success)]">{card.note}</p>
                    )}
                    {card.state === 'error' && (
                      <p className="mt-3 text-base font-medium text-[var(--danger)]">{card.note}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        )}
        {sending && (
          <div className="flex justify-start">
            <p className="text-lg text-[var(--text-secondary)]">Thinking…</p>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-[var(--danger)] p-3 text-lg text-[var(--danger)]">
          {error}
        </p>
      )}

      {/* quick-action chips */}
      <div className="flex flex-wrap gap-2" aria-label="Quick actions">
        <button
          type="button"
          onClick={() => sendMessage('What should I do now?')}
          disabled={sending}
          className="min-h-[48px] rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 text-lg font-medium text-[var(--text-primary)] disabled:opacity-50"
        >
          What should I do now?
        </button>
        <button
          type="button"
          onClick={() => sendMessage('I took my medicine')}
          disabled={sending}
          className="min-h-[48px] rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 text-lg font-medium text-[var(--text-primary)] disabled:opacity-50"
        >
          I took my medicine
        </button>
        {meta?.has_craving_history === true && (
          <button
            type="button"
            onClick={() => sendMessage('I need help with a craving')}
            disabled={sending}
            className="min-h-[48px] rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 text-lg font-medium text-[var(--text-primary)] disabled:opacity-50"
          >
            I want craving help
          </button>
        )}
      </div>

      {/* photo preview */}
      {photo && (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt="Photo you attached"
            className="h-16 w-16 rounded-xl object-cover"
          />
          <p className="flex-1 text-base text-[var(--text-secondary)]">
            Photo attached — it will be sent with your message.
          </p>
          <button
            type="button"
            onClick={() => setPhoto(null)}
            aria-label="Remove photo"
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-[var(--border)] text-xl text-[var(--text-primary)]"
          >
            ✕
          </button>
        </div>
      )}
      {photoError && (
        <p role="alert" className="text-base font-semibold text-[var(--danger)]">
          {photoError}
        </p>
      )}

      {/* input row */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          sendMessage(input, photo)
        }}
        className="flex items-end gap-2"
      >
        <label htmlFor="guide-input" className="sr-only">
          Type your message to the Health Guide
        </label>
        <textarea
          id="guide-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder="Type here…"
          disabled={sending}
          className="min-h-[56px] flex-1 resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-lg text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] disabled:opacity-50"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Attach a photo"
          onChange={(e) => {
            handlePhotoFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach a photo"
          title="Send a photo (for example of a meal or medicine label)"
          disabled={sending}
          className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-2xl text-[var(--text-primary)] disabled:opacity-50"
        >
          <span aria-hidden="true">📷</span>
        </button>
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleListening}
            aria-label={listening ? 'Stop voice input' : 'Speak your message'}
            title={listening ? 'Stop listening' : 'Speak instead of typing'}
            className={`flex min-h-[56px] min-w-[56px] items-center justify-center rounded-2xl border text-2xl ${
              listening
                ? 'border-[var(--danger)] bg-[var(--danger)] text-white'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]'
            }`}
          >
            <span aria-hidden="true">{listening ? '■' : '🎙'}</span>
          </button>
        )}
        <button
          type="submit"
          disabled={sending || (!input.trim() && !photo)}
          className="min-h-[56px] rounded-2xl bg-[var(--primary)] px-6 text-lg font-semibold text-[var(--primary-contrast)] disabled:opacity-50"
        >
          Send
        </button>
      </form>
      {listening && (
        <p className="text-base text-[var(--text-secondary)]" role="status">
          Listening… speak now.
        </p>
      )}
    </div>
  )
}
