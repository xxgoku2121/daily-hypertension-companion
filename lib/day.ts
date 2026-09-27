/* ============================================================
   Timezone-aware day boundaries.
   The server runs in UTC, but "today" belongs to the person using
   the app. We store their IANA timezone in profiles.timezone
   (set from the device on first load) and compute the local day here.
   Falls back to UTC when no timezone is known.
   ============================================================ */

export function resolveZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

/** Local calendar date as YYYY-MM-DD. */
export function zonedDate(tz: string | null | undefined, at: Date = new Date()): string {
  const zone = resolveZone(tz)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** Minutes since local midnight for `at`, in the given zone. */
export function zonedMinutes(tz: string | null | undefined, at: Date = new Date()): number {
  const zone = resolveZone(tz)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return get('hour') * 60 + get('minute')
}

/**
 * UTC instant of local midnight starting the given calendar date.
 * Iterative: guess, check what local wall-clock that instant shows,
 * and shift by the error. Converges in a couple of rounds and stays
 * correct across DST transitions, where the UTC offset at midnight can
 * differ from the offset at noon.
 */
function zonedMidnightUtc(
  y: number,
  mo: number,
  d: number,
  zone: string,
): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const target = Date.UTC(y, mo - 1, d, 0, 0, 0)
  let guess = Date.UTC(y, mo - 1, d, 12, 0, 0)
  for (let i = 0; i < 5; i++) {
    const parts = fmt.formatToParts(new Date(guess))
    const get = (t: string) =>
      Number(parts.find((p) => p.type === t)?.value ?? 0)
    // Some implementations render midnight as hour "24".
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour') % 24,
      get('minute'),
      get('second'),
    )
    const err = asUtc - target
    if (err === 0) break
    guess -= err
  }
  return guess
}

/**
 * UTC instants bounding the person's current local day, plus the
 * local date string. DST-safe: each bound is solved from its own
 * local midnight, so 23- and 25-hour days are exact.
 */
export function zonedDayBounds(tz: string | null | undefined): {
  date: string
  startIso: string
  endIso: string
} {
  const zone = resolveZone(tz)
  const now = new Date()
  const date = zonedDate(zone, now)
  const [y, mo, d] = date.split('-').map(Number)

  const start = zonedMidnightUtc(y, mo, d, zone)
  // Next calendar day, letting the Date roll months/years over.
  const next = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0))
  next.setUTCDate(next.getUTCDate() + 1)
  const end =
    zonedMidnightUtc(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
      zone,
    ) - 1
  return {
    date,
    startIso: new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
  }
}

/**
 * UTC instants bounding an explicit YYYY-MM-DD calendar day in the person's
 * timezone. Same DST-safe midnight solving as zonedDayBounds.
 */
export function zonedDayBoundsForDate(
  tz: string | null | undefined,
  dateStr: string
): { date: string; startIso: string; endIso: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return null
  const zone = resolveZone(tz)
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null

  const start = zonedMidnightUtc(y, mo, d, zone)
  // Next calendar day, letting the Date roll months/years over.
  const next = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0))
  next.setUTCDate(next.getUTCDate() + 1)
  const end =
    zonedMidnightUtc(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
      zone,
    ) - 1
  return {
    date: dateStr,
    startIso: new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
  }
}
