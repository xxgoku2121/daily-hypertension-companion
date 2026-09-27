// Health Guide chat API.
// POST { message, pageContext } -> { reply, message_id, evidence[], actions[], safety, mode }
// GET -> recent conversation (respects profile.ai_history) + chip-visibility meta.
//
// Auth: 401 when no authenticated user. RLS scopes every query to the user.
// AI: uses OPENAI_API_KEY server-side only. When missing (or the call fails),
// the guide answers with deterministic rule-based responses — never crashes,
// never exposes the missing key.
//
// Action proposals are ALWAYS confirmable: this route only creates pending
// ai_actions rows. Writes happen in app/api/guide/actions/route.ts after the
// person confirms.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildGuideContext, type GuideContext } from '@/lib/guide-context'
import { getTodayPlan } from '@/lib/today-plan'
import { zonedMinutes, zonedDate } from '@/lib/day'
import type { EvidenceSource } from '@/lib/types'

export const dynamic = 'force-dynamic'

const MAX_MESSAGE_LENGTH = 2000
const OPENAI_MODEL = 'gpt-4o-mini'
const OPENAI_TIMEOUT_MS = 25000
const NO_EVIDENCE_LINE =
  "I couldn't verify that claim from the medical sources available to me."

// ---------------------------------------------------------------------------
// auth + small helpers
// ---------------------------------------------------------------------------

async function getAuthed() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, user }
}

type Authed = NonNullable<Awaited<ReturnType<typeof getAuthed>>>

function unauthorized() {
  return NextResponse.json(
    { error: 'Please sign in to use the Health Guide.' },
    { status: 401 }
  )
}

function friendly500() {
  return NextResponse.json(
    { error: 'Something went wrong on my side. Please try again in a moment.' },
    { status: 500 }
  )
}

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

interface ActionProposal {
  action_id: string
  label: string
  description: string
}

interface EvidenceView {
  id: string
  source_name: string
  source_title: string | null
  source_url: string
  published_date: string | null
}

interface IntentResult {
  reply: string
  proposals: ActionProposal[]
  evidence?: EvidenceSource[]
}

// ---------------------------------------------------------------------------
// safety: emergency symptom detection (deterministic, always on)
// ---------------------------------------------------------------------------

const SAFETY_PATTERNS: RegExp[] = [
  /chest\s*(pain|pressure|tightness|hurts|hurting)/,
  /severe headache/,
  /worst headache/,
  /\bnumbness\b/,
  /trouble (breathing|speaking)/,
  /difficulty (breathing|speaking)/,
  /short(ness)? of breath/,
  /can'?t breathe/,
  /vision (loss|changes|blurry|blurred)/,
  /going blind/,
  /\bslurred\b/,
  /face (droop|drooping)/,
  /weakness on one side/,
  /\bfainted\b/,
  /passed out/,
  /feels? like (i'?m|im) going to pass out/,
]

function isSafetyMessage(message: string): boolean {
  const m = message.toLowerCase()
  return SAFETY_PATTERNS.some((p) => p.test(m))
}

function safetyReply(): string {
  return (
    `Let's put everything else aside — your safety comes first.\n\n` +
    `Call emergency services (911) right now if you have any of these:\n` +
    `• Chest pain, pressure, or tightness\n` +
    `• Trouble breathing or shortness of breath\n` +
    `• Numbness or weakness on one side of your body\n` +
    `• Trouble speaking or understanding speech\n` +
    `• Sudden vision changes or loss of vision\n` +
    `• A sudden, severe headache unlike any you've had before\n` +
    `• Fainting, or feeling like you might pass out\n\n` +
    `Do not drive yourself. If you can, sit down and have someone stay with you until help arrives.\n\n` +
    `Quick checklist — do any of these describe how you feel right now? If yes to any, please call 911 now instead of continuing to chat.\n\n` +
    `If you're already safe and none of these apply, tell me in your own words what you're feeling and I'll help you think through the next step. You can also call your doctor or pharmacist today for advice about your symptoms.`
  )
}

// ---------------------------------------------------------------------------
// evidence lookup by topic keywords
// ---------------------------------------------------------------------------

function topicsForMessage(message: string): string[] {
  const m = message.toLowerCase()
  const topics = new Set<string>()
  if (/(blood pressure|\bbp\b|systolic|diastolic|hypertension|high blood|reading)/.test(m)) {
    topics.add('blood_pressure')
    topics.add('measurement')
  }
  if (/(sodium|\bsalt\b|salty)/.test(m)) topics.add('sodium')
  if (/(walk|exercise|activit|steps|workout|moving)/.test(m)) topics.add('activity')
  if (/\bdash\b|diet|eating|food|meal|nutrition/.test(m)) topics.add('lifestyle')
  if (/(smok|cigarette|nicotine|crav|vape)/.test(m)) topics.add('smoking')
  if (/(cuff|how (do|should) i (take|measure)|measure .*pressure)/.test(m))
    topics.add('measurement')
  return [...topics]
}

async function fetchEvidence(
  supabase: Authed['supabase'],
  topics: string[]
): Promise<EvidenceSource[]> {
  if (topics.length === 0) return []
  const { data } = await supabase
    .from('evidence_sources')
    .select('*')
    .in('topic', topics)
    .eq('status', 'active')
    .order('last_verified', { ascending: false })
    .limit(8)
  return (data ?? []) as EvidenceSource[]
}

function toEvidenceView(e: EvidenceSource): EvidenceView {
  return {
    id: e.id,
    source_name: e.source_name,
    source_title: e.source_title,
    source_url: e.source_url,
    published_date: e.published_date,
  }
}

// ---------------------------------------------------------------------------
// intent detection (deterministic)
// ---------------------------------------------------------------------------

interface DetectedIntents {
  logBp: { systolic: number; diastolic: number } | null
  medTaken: boolean
  craving: boolean
  nextStep: boolean
  reminder: { label: string; recurring: boolean } | null
  doctorQuestion: string | null
}

function detectIntents(message: string): DetectedIntents {
  const m = message.toLowerCase().trim()

  // "my bp is 140/90" / "140/90" / "140 over 90"
  let logBp: DetectedIntents['logBp'] = null
  const slash = m.match(/(\d{2,3})\s*\/\s*(\d{2,3})/)
  const over = m.match(/(\d{2,3})\s+over\s+(\d{2,3})/)
  const nums = slash ?? over
  if (nums && /(bp|blood pressure|reading|pressure)/.test(m)) {
    const systolic = parseInt(nums[1], 10)
    const diastolic = parseInt(nums[2], 10)
    if (systolic >= 40 && systolic <= 300 && diastolic >= 30 && diastolic <= 200) {
      logBp = { systolic, diastolic }
    }
  }

  const medTaken =
    /(i (just )?took|i've taken|i have taken|took my) (my )?(medicine|medication|meds|pills|tablet)/.test(
      m
    ) || /^(i took (it|them))/.test(m)

  const craving = /(crav(ing|e)|urge to smoke|want a cigarette|want to smoke|need a cigarette)/.test(m)

  const nextStep =
    /(what should i do|what'?s (the )?next|next step|what do i need to do|what('s| is) next)/.test(m)

  let reminder: DetectedIntents['reminder'] = null
  const remMatch = m.match(/remind me to (.+?)(?:\s+every day|\s+daily)?$/)
  if (/remind me|set a reminder/.test(m) && remMatch && remMatch[1].trim().length > 1) {
    reminder = {
      label: remMatch[1].trim().replace(/\s+every day$/, '').replace(/\s+daily$/, ''),
      recurring: /every day|daily/.test(m),
    }
  }

  let doctorQuestion: string | null = null
  const dqMatch = message.match(/(?:question for (?:my )?doctor|ask my doctor)[:\s]+(.+)/i)
  if (dqMatch && dqMatch[1].trim().length > 3) {
    doctorQuestion = dqMatch[1].trim().slice(0, 500)
  }

  return { logBp, medTaken, craving, nextStep, reminder, doctorQuestion }
}

// ---------------------------------------------------------------------------
// action proposals (pending ai_actions rows — never executed here)
// ---------------------------------------------------------------------------

async function proposeAction(
  supabase: Authed['supabase'],
  userId: string,
  action_type: string,
  label: string,
  description: string,
  params: Record<string, unknown>
): Promise<ActionProposal> {
  const { data, error } = await supabase
    .from('ai_actions')
    .insert({
      user_id: userId,
      action_type,
      requested_params: params,
      confirmation_status: 'pending',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error('proposal insert failed')
  return {
    action_id: (data as { id: string }).id,
    label,
    description,
  }
}

function firstNameOf(ctx: GuideContext): string {
  return ctx.name ? ctx.name.split(' ')[0] : ''
}

function medDisplayName(m: { name: string; dose: string | null }): string {
  return `${m.name}${m.dose ? ` ${m.dose}` : ''}`
}

/** Expected doses per day from the frequency text. Defaults to 1 — never guesses more. */
function dosesPerDay(frequency: string | null | undefined): number {
  const freq = (frequency || '').toLowerCase()
  if (freq.includes('twice')) return 2
  if (freq.includes('three')) return 3
  return 1
}

function takenCountFor(ctx: GuideContext, medId: string): number {
  return ctx.todayMedLogs.filter((l) => l.medication_id === medId && l.status === 'taken').length
}

/** Medicines that still have doses due today — dose-aware, not binary per medicine. */
function untakenMeds(ctx: GuideContext) {
  return ctx.activeMedications.filter((m) => takenCountFor(ctx, m.id) < dosesPerDay(m.frequency))
}

/** Current hour (0-23) in the person's own timezone — never the server's clock. */
function userHour(ctx: GuideContext): number {
  return Math.floor(zonedMinutes(ctx.timezone) / 60)
}

/**
 * Shared "next step" decision.
 * NOTE (integration point): when lib/next-action.ts is available from the
 * sibling agent, prefer getNextAction(supabase, userId) here so the guide and
 * Home stay consistent. This local logic is a defensive stand-in with the
 * same priority order: due medication -> due BP reading -> gentle activity
 * nudge -> honestly caught up.
 */
function computeNextStep(ctx: GuideContext): { text: string; medId: string | null } {
  const hour = userHour(ctx)
  const due = untakenMeds(ctx)

  if (due.length > 0) {
    const med = due[0]
    const expected = dosesPerDay(med.frequency)
    const taken = takenCountFor(ctx, med.id)
    const doseBit = expected > 1 ? ` (dose ${taken + 1} of ${expected})` : ''
    return {
      text: `Your next step is to take ${medDisplayName(med)}${doseBit}.`,
      medId: med.id,
    }
  }

  // Only suggest BP readings when the person shares blood pressure data.
  const bpAllowed = ctx.permissions.includes('blood_pressure')

  // "Today" in the person's timezone — the server's calendar day can differ.
  const todayStr = zonedDate(ctx.timezone)
  const isToday = (iso: string) => zonedDate(ctx.timezone, new Date(iso)) === todayStr
  const hasMorning = ctx.recentBp.some((r) => r.period === 'morning' && isToday(r.measured_at))
  const hasEvening = ctx.recentBp.some((r) => r.period === 'evening' && isToday(r.measured_at))
  if (bpAllowed && !hasMorning && hour < 12) {
    return { text: 'Your next step is to take your morning blood pressure reading.', medId: null }
  }
  if (bpAllowed && !hasEvening && hour >= 12) {
    return { text: 'Your next step is to take your evening blood pressure reading.', medId: null }
  }

  return {
    text: "You're caught up — nothing is due right now. Nice work.",
    medId: null,
  }
}

async function handleIntents(
  supabase: Authed['supabase'],
  userId: string,
  message: string,
  intents: DetectedIntents,
  ctx: GuideContext
): Promise<IntentResult | null> {
  const hello = firstNameOf(ctx)
  const greet = hello ? `${hello}, ` : ''

  // 1) log a BP reading
  if (intents.logBp) {
    const { systolic, diastolic } = intents.logBp
    // Same default as the BP page: morning before noon in the person's timezone.
    const period = userHour(ctx) < 12 ? 'morning' : 'evening'
    const proposal = await proposeAction(
      supabase,
      userId,
      'log_bp',
      `Save blood pressure ${systolic}/${diastolic}`,
      `I'll save ${systolic}/${diastolic} as your ${period} reading.`,
      { systolic, diastolic, period }
    )
    return {
      reply: `${greet}I have ${systolic}/${diastolic} as your ${period} reading. Confirm below and I'll save it.`,
      proposals: [proposal],
    }
  }

  // 2) mark medication taken
  if (intents.medTaken) {
    const medsAllowed = ctx.permissions.includes('medication')
    if (!medsAllowed) {
      return {
        reply: `${greet}I can't see your medications right now — that permission is off. Turn on "Medications" under Settings → Health Guide if you'd like me to help with them.`,
        proposals: [],
      }
    }
    if (ctx.activeMedications.length === 0) {
      return {
        reply: `${greet}you don't have any medications listed in the app yet, so there's nothing to mark. If you'd like, tell me the name and dose and I can help you add it.`,
        proposals: [],
      }
    }
    const untaken = untakenMeds(ctx)
    if (untaken.length === 0) {
      return {
        reply: `Looks like all of today's doses are already marked as taken. Well done staying on track.`,
        proposals: [],
      }
    }
    const proposals: ActionProposal[] = []
    for (const med of untaken) {
      const expected = dosesPerDay(med.frequency)
      const taken = takenCountFor(ctx, med.id)
      const doseBit = expected > 1 ? ` (dose ${taken + 1} of ${expected})` : ''
      proposals.push(
        await proposeAction(
          supabase,
          userId,
          'mark_medication_taken',
          `Mark ${medDisplayName(med)} as taken${doseBit}`,
          `I'll record ${medDisplayName(med)} as taken${doseBit} right now.`,
          { medication_id: med.id }
        )
      )
    }
    const names = untaken.map(medDisplayName).join(', ')
    return {
      reply: `Got it — I'll mark ${names} as taken. Just confirm below.`,
      proposals,
    }
  }

  // 3) craving support: immediate help + optional confirmed logging
  if (intents.craving) {
    const proposal = await proposeAction(
      supabase,
      userId,
      'start_craving_support',
      'Log this craving and save a coping plan',
      'Records that a craving happened so we can learn what helps, and saves a short coping plan.',
      { note: message.slice(0, 300) }
    )
    return {
      reply:
        `I'm here with you — cravings pass, usually within a few minutes. Try this right now:\n` +
        `1. Breathe slowly: in for 4 counts, out for 6 counts, 3 times.\n` +
        `2. Drink a full glass of water.\n` +
        `3. Do something with your hands for 5 minutes — a short walk works well.\n\n` +
        `If you confirm below, I'll log this craving so we can spot patterns together. You don't have to face this alone.`,
      proposals: [proposal],
    }
  }

  // 4) "what should I do now?"
  if (intents.nextStep) {
    const step = computeNextStep(ctx)
    const proposals: ActionProposal[] = []
    if (step.medId) {
      const med = ctx.activeMedications.find((m) => m.id === step.medId)
      if (med) {
        proposals.push(
          await proposeAction(
            supabase,
            userId,
            'mark_medication_taken',
            `Mark ${medDisplayName(med)} as taken`,
            `I'll record ${medDisplayName(med)} as taken right now.`,
            { medication_id: med.id }
          )
        )
      }
    }
    return { reply: step.text, proposals }
  }

  // 5) reminder
  if (intents.reminder) {
    // 5) reminder — one-time only. Repeating reminders are not offered because
    // nothing in the app delivers them yet; promising "every day" would be a lie.
    const proposal = await proposeAction(
      supabase,
      userId,
      'create_reminder',
      `Reminder: ${intents.reminder.label}`,
      intents.reminder.recurring
        ? `I'll add "${intents.reminder.label}" to your reminders for today. (Repeating reminders aren't available yet.)`
        : `I'll remind you: "${intents.reminder.label}".`,
      { label: intents.reminder.label, recurring: false }
    )
    return {
      reply: `I've prepared that reminder. Confirm below and I'll set it up.`,
      proposals: [proposal],
    }
  }

  // 6) question for the doctor
  if (intents.doctorQuestion) {
    const proposal = await proposeAction(
      supabase,
      userId,
      'add_doctor_question',
      'Save question for your doctor',
      `"${intents.doctorQuestion}"`,
      { question: intents.doctorQuestion }
    )
    return {
      reply: `Good idea to ask your doctor about that. Confirm below and I'll save it to your doctor questions.`,
      proposals: [proposal],
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// OpenAI chat (server-side only; graceful when unavailable)
// ---------------------------------------------------------------------------

function buildSystemPrompt(ctx: GuideContext): string {
  const hello = firstNameOf(ctx)
  return (
    `You are the Health Guide, a warm health coach inside the Steady app (Steady — Daily Hypertension Companion). ` +
    `You speak like a caring, plain-spoken companion — never like a database, a search box, or a disclaimer machine. ` +
    (hello
      ? `Address the person as ${hello}. `
      : `You do not know the person's name; be warm without using one. `) +
    `\nSTRICT RULES:\n` +
    `1. NEVER say "Saved fact", "According to stored data", "my records show", or anything that sounds like reading a database. Talk about their life naturally.\n` +
    `2. Keep three kinds of statements clearly separate:\n` +
    `   - ESTABLISHED EVIDENCE: claims backed by the SOURCES provided. Name the source in plain words.\n` +
    `   - PERSONAL OBSERVATION: things you notice from the CONTEXT about their own life. Phrase as observations, never as medical conclusions.\n` +
    `   - AI SUGGESTION: your own ideas, always framed as suggestions to consider, never orders.\n` +
    `3. NEVER diagnose any condition. NEVER prescribe, recommend, start, stop, or change any medication or dose. NEVER give missed-dose instructions. NEVER invent emergency thresholds, drug interactions, or citations.\n` +
    `4. Instructions labeled PRESCRIPTION (from their prescription, clinician, or pharmacist) outrank your suggestions. If a suggestion conflicts, defer to the prescription and say so.\n` +
    `5. If you cannot support a health claim with the provided sources, say exactly: "${NO_EVIDENCE_LINE}"\n` +
    `6. Keep replies short and readable for an older adult: plain words, short sentences, one idea at a time. No jargon.\n` +
    `7. Respond with JSON ONLY, in this shape: { "reply": "your message text", "evidence_ids": ["id", ...] }. ` +
    `List only the ids of sources you actually relied on, from the SOURCES list. Do not put raw ids in the reply text; the app renders a Why? button from evidence_ids.`
  )
}

function buildUserPrompt(
  ctx: GuideContext,
  message: string,
  evidence: EvidenceSource[],
  pageContext: string | null
): string {
  const parts: string[] = []
  parts.push(`The person wrote: "${message}"`)
  if (pageContext) parts.push(`They are on the "${pageContext}" screen of the app.`)
  parts.push(`\nCONTEXT — only what this person has chosen to share. Treat absence of data as unknown, never as permission to infer.`)
  if (ctx.sections.length === 0) {
    parts.push(`(No personal context shared yet.)`)
  } else {
    for (const s of ctx.sections) {
      parts.push(`[${s.heading}]\n${s.body}`)
    }
  }
  if (evidence.length > 0) {
    parts.push(
      `\nSOURCES YOU MAY CITE (use only these):\n` +
        evidence
          .map(
            (e) =>
              `- [${e.id}] (${e.topic}) ${e.claim} — Source: ${e.source_name}${e.source_title ? `, "${e.source_title}"` : ''}${e.published_date ? `, published ${e.published_date}` : ''}`
          )
          .join('\n')
    )
  } else {
    parts.push(`\n(No medical sources matched this message. If you make a health claim, use the exact unverifiable line.)`)
  }
  return parts.join('\n')
}

function safeJsonParse(text: string): { reply?: unknown; evidence_ids?: unknown } | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function askOpenAI(
  ctx: GuideContext,
  message: string,
  evidence: EvidenceSource[],
  pageContext: string | null,
  image: string | null = null
): Promise<{ reply: string; evidence_ids: string[] } | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), OPENAI_TIMEOUT_MS)
    const systemContent =
      buildSystemPrompt(ctx) +
      (image
        ? ' The user attached a photo. Look at it carefully and weave what you see into your answer (for example: foods and likely sodium, a medicine label and its directions, or a monitor reading). If the photo is unclear, say so and ask what they wanted you to see.'
        : '')
    const userContent: unknown = image
      ? [
          {
            type: 'text',
            text:
              (message
                ? message
                : 'What do you see in this photo, and what should I know about it for my blood pressure?') +
              '\n\n' +
              buildUserPrompt(ctx, message || '(photo attached)', evidence, pageContext),
          },
          { type: 'image_url', image_url: { url: image, detail: 'low' } },
        ]
      : buildUserPrompt(ctx, message, evidence, pageContext)
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.3,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent },
        ],
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const json = await res.json()
    const text: string = json?.choices?.[0]?.message?.content ?? ''
    const parsed = safeJsonParse(text)
    if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) {
      const ids = Array.isArray(parsed.evidence_ids)
        ? parsed.evidence_ids.filter((x): x is string => typeof x === 'string')
        : []
      return { reply: parsed.reply.trim(), evidence_ids: ids }
    }
    // Unparseable model output is never shown raw (it is often a JSON-shaped
    // blob) — fall through to the rule-based reply below.
    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// rule-based fallback (no OpenAI key, or the call failed)
// ---------------------------------------------------------------------------

function fallbackReply(
  message: string,
  ctx: GuideContext,
  evidence: EvidenceSource[]
): { reply: string; evidence: EvidenceSource[] } {
  const m = message.toLowerCase().trim()
  const hello = firstNameOf(ctx)

  if (/^(hi|hello|hey|good (morning|afternoon|evening)|howdy)\b/.test(m)) {
    return {
      reply:
        `Hello${hello ? ` ${hello}` : ''}! I'm your Health Guide. ` +
        `I can help you figure out your next step for today, answer questions about blood pressure, ` +
        `and keep track of your medicines and reminders. What's on your mind?`,
      evidence: [],
    }
  }

  if (/\bthank/.test(m)) {
    return { reply: `You're very welcome${hello ? `, ${hello}` : ''}. I'm here whenever you need me.`, evidence: [] }
  }

  if (evidence.length > 0) {
    const used = evidence.slice(0, 2)
    const lines = used.map((e) => `• ${e.claim} (Source: ${e.source_name})`).join('\n')
    return {
      reply:
        `Here's what established guidance says:\n${lines}\n\n` +
        `This is general information, not medical advice. If it affects a decision about your health, ` +
        `please check with your doctor or pharmacist. Want me to explain what this means day to day?`,
      evidence: used,
    }
  }

  return {
    reply:
      `I can help with things like:\n` +
      `• "What should I do now?" — your next step for today\n` +
      `• "I took my medicine" — mark a dose as taken\n` +
      `• "My BP is 140/90" — save a reading\n` +
      `• "Remind me to ..." — set a reminder\n` +
      `• Questions about blood pressure, salt, activity, or quitting smoking\n\n` +
      `Just ask in your own words.`,
    evidence: [],
  }
}

// ---------------------------------------------------------------------------
// POST + GET handlers
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const authed = await getAuthed()
  if (!authed) return unauthorized()
  const { supabase, user } = authed

  let body: { message?: unknown; pageContext?: unknown; image?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'I could not read your message. Please try again.' },
      { status: 400 }
    )
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const pageContext =
    typeof body.pageContext === 'string' ? body.pageContext.slice(0, 100) : null

  // Optional attached photo (data URL). Validated: image MIME + size cap.
  const MAX_IMAGE_CHARS = 7 * 1024 * 1024 // ~5 MB of image data
  let image: string | null = null
  if (typeof body.image === 'string' && body.image.length > 0) {
    const looksRight =
      /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(body.image)
    if (!looksRight || body.image.length > MAX_IMAGE_CHARS + 30) {
      return NextResponse.json(
        { error: 'That photo could not be used. Please try a JPG or PNG under 5 MB.' },
        { status: 400 }
      )
    }
    image = body.image
  }

  if (!message && !image) {
    return NextResponse.json({ error: 'Please type a message first.' }, { status: 400 })
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: 'That message is a bit long. Please shorten it and try again.' },
      { status: 400 }
    )
  }

  try {
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('ai_history')
      .eq('id', user.id)
      .maybeSingle()
    const keepHistory = (profileRow as { ai_history?: boolean } | null)?.ai_history !== false

    if (keepHistory) {
      await supabase.from('ai_messages').insert({
        user_id: user.id,
        role: 'user',
        content: image ? `${message}\n[Photo attached]`.trim() : message,
        page_context: pageContext,
      })
    }

    // Safety first: emergency symptoms bypass normal chat entirely.
    if (isSafetyMessage(message)) {
      const reply = safetyReply()
      let messageId: string | null = null
      if (keepHistory) {
        const { data } = await supabase
          .from('ai_messages')
          .insert({
            user_id: user.id,
            role: 'assistant',
            content: reply,
            page_context: pageContext,
          })
          .select('id')
          .single()
        messageId = (data as { id: string } | null)?.id ?? null
      }
      return NextResponse.json({
        reply,
        message_id: messageId,
        evidence: [],
        actions: [],
        safety: true,
        mode: 'rule' as const,
      })
    }

    const ctx = await buildGuideContext(supabase, user.id)
    const intents = detectIntents(message)
    const topics = topicsForMessage(message)
    const evidence = await fetchEvidence(supabase, topics)

    // Deterministic intents work with or without OpenAI (text only —
    // a photo always goes to the vision path below).
    const handled = image
      ? null
      : await handleIntents(supabase, user.id, message, intents, ctx)

    let reply: string
    let proposals: ActionProposal[] = []
    let usedEvidence: EvidenceSource[] = []
    let mode: 'ai' | 'rule' = 'rule'

    if (handled) {
      reply = handled.reply
      proposals = handled.proposals
      usedEvidence = handled.evidence ?? []
    } else {
      const ai = await askOpenAI(ctx, message, evidence, pageContext, image)
      if (ai) {
        reply = ai.reply
        usedEvidence = evidence.filter((e) => ai.evidence_ids.includes(e.id))
        mode = 'ai'
      } else if (image) {
        // Honest fallback: without the AI connection we cannot see photos.
        const hello = firstNameOf(ctx)
        reply =
          `Thanks for the photo${hello ? `, ${hello}` : ''} — I can't view images right now ` +
          `because my AI connection isn't set up yet. Could you describe what the photo shows ` +
          `in a few words? For example: "a bowl of chicken soup" or "my blood pressure monitor showing 142/88".\n\n` +
          `If this is urgent — chest pain, trouble breathing, or a very high reading with symptoms — ` +
          `please call emergency services right away rather than waiting on me.`
        usedEvidence = []
      } else {
        const fb = fallbackReply(message, ctx, evidence)
        reply = fb.reply
        usedEvidence = fb.evidence
      }
    }

    let messageId: string | null = null
    if (keepHistory) {
      const { data } = await supabase
        .from('ai_messages')
        .insert({
          user_id: user.id,
          role: 'assistant',
          content: reply,
          page_context: pageContext,
        })
        .select('id')
        .single()
      messageId = (data as { id: string } | null)?.id ?? null
    }

    return NextResponse.json({
      reply,
      message_id: messageId,
      evidence: usedEvidence.map(toEvidenceView),
      actions: proposals,
      safety: false,
      mode,
    })
  } catch {
    return friendly500()
  }
}

export async function GET() {
  const authed = await getAuthed()
  if (!authed) return unauthorized()
  const { supabase, user } = authed

  try {
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('ai_history, name')
      .eq('id', user.id)
      .maybeSingle()
    const profile = (profileRow ?? {}) as { ai_history?: boolean; name?: string | null }
    const keepHistory = profile.ai_history !== false

    let messages: { id: string; role: string; content: string; created_at: string }[] = []
    if (keepHistory) {
      const { data } = await supabase
        .from('ai_messages')
        .select('id, role, content, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      // Latest 50, back in chronological order for display.
      messages = ((data ?? []) as typeof messages).reverse()
    }

    const [{ data: meds }, { data: habits }] = await Promise.all([
      supabase
        .from('medications')
        .select('id')
        .eq('user_id', user.id)
        .eq('active', true)
        .limit(1),
      supabase
        .from('habit_records')
        .select('id')
        .eq('user_id', user.id)
        .in('kind', ['craving_event', 'smoking_event'])
        .limit(1),
    ])

    // Today's real state drives the suggestion chips on the client.
    let plan: Awaited<ReturnType<typeof getTodayPlan>> = []
    try {
      plan = await getTodayPlan(supabase, user.id)
    } catch {
      plan = []
    }

    return NextResponse.json({
      messages,
      meta: {
        name: profile.name ?? null,
        has_medications: ((meds ?? []) as { id: string }[]).length > 0,
        has_craving_history: ((habits ?? []) as { id: string }[]).length > 0,
        bp_pending: plan.some(
          (p) => (p.id === 'bp-morning' || p.id === 'bp-evening') && !p.done
        ),
        meds_pending_today: plan.filter((p) => p.id.startsWith('med-') && !p.done).length,
        appointment_today: plan.some((p) => p.id.startsWith('appt-')),
      },
    })
  } catch {
    return friendly500()
  }
}
