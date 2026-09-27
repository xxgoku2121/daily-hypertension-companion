// Vision extraction API.
// POST { image: <data URL>, kind: 'bp' | 'medicine' | 'food' }
//   -> { ok: true, kind, data } | { ok: false, reason, message }
//
// Extracts structured data from photos using OpenAI vision (gpt-4o-mini).
// When no OPENAI_API_KEY is configured (or the call fails), returns
// ok:false with an honest message — never fabricates numbers.
// Nothing is saved here; the caller shows a confirm screen first.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const OPENAI_MODEL = 'gpt-4o-mini'
const OPENAI_TIMEOUT_MS = 30000
const MAX_IMAGE_CHARS = 7 * 1024 * 1024 // ~5 MB of image data

type Kind = 'bp' | 'medicine' | 'food'

const KIND_PROMPTS: Record<Kind, string> = {
  bp: [
    'You are reading a blood pressure monitor display in a photo.',
    'Extract the numbers you can clearly see. Respond ONLY with JSON:',
    '{ "systolic": <number or null>, "diastolic": <number or null>, "pulse": <number or null>,',
    '  "confidence": "high" | "medium" | "low",',
    '  "notes": "<one short line, e.g. which value was unclear>" }',
    'Rules: systolic is the larger number, diastolic the smaller. Pulse may be labeled PUL/min or a heart icon.',
    'If a value is not clearly readable, use null and set confidence to "low".',
    'Never guess a number that is not visible. Sanity bounds: systolic 70-260, diastolic 40-150, pulse 30-200.',
  ].join('\n'),
  medicine: [
    'You are reading a prescription medicine label or medicine bottle in a photo.',
    'Extract what you can clearly read. Respond ONLY with JSON:',
    '{ "name": <string or null>, "strength": <string or null, e.g. "10 mg">,',
    '  "directions": <string or null, e.g. "Take one tablet daily">,',
    '  "frequency": <string or null, e.g. "once daily">,',
    '  "prescriber": <string or null>, "pharmacy": <string or null>,',
    '  "refills": <string or null>,',
    '  "confidence": "high" | "medium" | "low",',
    '  "notes": "<one short line>" }',
    'Rules: transcribe exactly what the label says — do not expand abbreviations into medical advice.',
    'If text is blurry or cut off, use null for that field and lower the confidence.',
    'Never invent a medicine name, dose, or direction.',
  ].join('\n'),
  food: [
    'You are looking at a photo of food or a nutrition label.',
    'Describe it helpfully for someone watching sodium for blood pressure. Respond ONLY with JSON:',
    '{ "description": <string, what you see>,',
    '  "likely_sodium_mg": <number or null — ONLY if the nutrition label clearly shows sodium, or the food is a plain whole food with well-known sodium; otherwise null>,',
    '  "sodium_confidence": "high" | "medium" | "low",',
    '  "notes": "<one short line, e.g. \\"label blurry — estimate only\\">" }',
    'Rules: if you cannot confidently determine sodium, use null and say so in notes.',
    'Never fabricate a sodium number. A rough range is acceptable ONLY when labeled as an estimate in notes.',
  ].join('\n'),
}

function validImage(image: unknown): image is string {
  return (
    typeof image === 'string' &&
    image.length > 0 &&
    image.length <= MAX_IMAGE_CHARS + 30 &&
    /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(image)
  )
}

function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        const parsed: unknown = JSON.parse(text.slice(start, end + 1))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>
        }
      } catch {
        return null
      }
    }
    return null
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })
  }

  let body: { image?: unknown; kind?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'bad-request', message: 'I could not read that photo. Please try again.' },
      { status: 400 }
    )
  }

  const kind: Kind | null =
    body.kind === 'bp' || body.kind === 'medicine' || body.kind === 'food'
      ? body.kind
      : null
  if (!kind || !validImage(body.image)) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'bad-request',
        message: 'That photo could not be used. Please try a JPG or PNG under 5 MB.',
      },
      { status: 400 }
    )
  }

  const key = process.env.OPENAI_API_KEY
  if (!key) {
    return NextResponse.json({
      ok: false,
      reason: 'no-ai',
      message:
        'Photo reading needs the AI connection, which isn\u2019t set up right now. You can enter the numbers by hand instead — it only takes a moment.',
    })
  }

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), OPENAI_TIMEOUT_MS)
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: KIND_PROMPTS[kind] },
              { type: 'image_url', image_url: { url: body.image, detail: 'high' } },
            ],
          },
        ],
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        reason: 'ai-error',
        message: 'I had trouble reading that photo. Please try again or enter it by hand.',
      })
    }
    const json = await res.json()
    const text: string = json?.choices?.[0]?.message?.content ?? ''
    const data = safeJsonParse(text)
    if (!data) {
      return NextResponse.json({
        ok: false,
        reason: 'ai-error',
        message: 'I could not make sense of that photo. Please try a clearer one or enter it by hand.',
      })
    }
    return NextResponse.json({ ok: true, kind, data })
  } catch {
    return NextResponse.json({
      ok: false,
      reason: 'ai-error',
      message: 'Photo reading timed out. Please try again or enter it by hand.',
    })
  }
}
