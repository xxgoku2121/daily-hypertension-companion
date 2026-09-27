/* Steady brand logo — a heart with a pulse line on a medical-blue badge.
   Use <LogoMark> for the badge alone, <Logo> for badge + "Steady" wordmark. */

import { useId } from 'react'

export function LogoMark({
  size = 44,
  className = '',
}: {
  size?: number
  className?: string
}) {
  const gradId = useId()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Steady logo"
      className={className}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f6df6" />
          <stop offset="1" stopColor="#1e40af" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="16" fill={`url(#${gradId})`} />
      <path
        d="M32 47 C32 47 15 35 15 24.5 C15 17.5 20.5 13 26 13 C29.2 13 31.2 14.8 32 16.8 C32.8 14.8 34.8 13 38 13 C43.5 13 49 17.5 49 24.5 C49 35 32 47 32 47 Z"
        fill="#ffffff"
      />
      <polyline
        points="19,30 26,30 29,23 33,37 37,27 39.5,30 45,30"
        fill="none"
        stroke="#1e40af"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Logo({
  size = 44,
  wordmark = true,
  sub,
  dark = false,
  className = '',
}: {
  size?: number
  /** Show the "Steady" wordmark next to the badge. */
  wordmark?: boolean
  /** Small caption under the wordmark, e.g. "Daily Hypertension Companion". */
  sub?: string
  /** Light text for dark backgrounds (sidebar). */
  dark?: boolean
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <LogoMark size={size} />
      {wordmark && (
        <span className="flex flex-col leading-tight">
          <span
            className={`text-2xl font-extrabold tracking-tight ${
              dark ? 'text-white' : 'text-[var(--text-primary)]'
            }`}
          >
            Steady
          </span>
          {sub && (
            <span
              className={`text-sm ${
                dark
                  ? 'text-white/70'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              {sub}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
