'use client'

import { useRef, useState } from 'react'

export type PhotoKind = 'bp' | 'medicine' | 'food'

const KIND_COPY: Record<
  PhotoKind,
  { button: string; title: string; hint: string }
> = {
  bp: {
    button: 'Take photo of monitor',
    title: 'Read your monitor',
    hint: 'Hold the phone steady and make sure the numbers are clear.',
  },
  medicine: {
    button: 'Take photo of label',
    title: 'Read your prescription label',
    hint: 'Make sure the label text is readable and not cut off.',
  },
  food: {
    button: 'Take a photo',
    title: 'What are you eating?',
    hint: 'A photo of the meal or the nutrition label works best.',
  },
}

/**
 * Reusable photo capture: pick/take a photo, send it to /api/vision/extract,
 * and hand the structured result back. The caller owns the confirm screen.
 */
export default function PhotoCapture({
  kind,
  onExtracted,
  onCancel,
}: {
  kind: PhotoKind
  onExtracted: (data: Record<string, unknown>) => void
  onCancel?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copy = KIND_COPY[kind]

  async function handleFile(file: File | undefined) {
    setError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose a photo file (JPG or PNG).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('That photo is too large. Please pick one under 5 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      if (typeof reader.result !== 'string') return
      setPreview(reader.result)
      setScanning(true)
      try {
        const res = await fetch('/api/vision/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: reader.result, kind }),
        })
        const json = await res.json()
        if (json.ok) {
          onExtracted(json.data as Record<string, unknown>)
        } else {
          setError(
            typeof json.message === 'string'
              ? json.message
              : 'I could not read that photo. Please try a clearer one.'
          )
        }
      } catch {
        setError('Photo reading failed. Please try again.')
      } finally {
        setScanning(false)
      }
    }
    reader.onerror = () => setError('Could not read that photo. Please try another.')
    reader.readAsDataURL(file)
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="text-xl font-bold text-[var(--text-primary)]">{copy.title}</h3>
      <p className="mt-1 text-base text-[var(--text-secondary)]">{copy.hint}</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={copy.button}
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {!preview ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-secondary)] text-xl font-bold text-[var(--primary)]"
        >
          <span aria-hidden="true" className="text-2xl">📷</span>
          {copy.button}
        </button>
      ) : (
        <div className="mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Photo you took"
            className="max-h-56 w-full rounded-xl object-cover"
          />
          {scanning ? (
            <div
              className="mt-3 flex items-center gap-3 rounded-xl bg-[var(--surface-secondary)] p-4"
              role="status"
            >
              <span
                className="h-6 w-6 shrink-0 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--primary)]"
                aria-hidden="true"
              />
              <p className="text-lg text-[var(--text-primary)]">Reading your photo…</p>
            </div>
          ) : (
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setPreview(null)
                  setError(null)
                  inputRef.current?.click()
                }}
                className="min-h-[52px] flex-1 rounded-xl border border-[var(--border)] text-lg font-bold text-[var(--text-primary)]"
              >
                Retake
              </button>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="min-h-[52px] flex-1 rounded-xl border border-[var(--border)] text-lg font-bold text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-base font-semibold text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  )
}
