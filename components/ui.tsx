'use client'

/* Senior-friendly UI primitives + authenticated app shell for the
   Daily Hypertension Companion. All styling flows from the CSS theme
   tokens in app/globals.css (data-theme on <html>). */

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import { FeedbackButton } from './FeedbackButton'
import { LogoMark } from './Logo'
import type { NextAction } from '@/lib/types'

/* ============================== Icons ============================== */

const ICON_PATHS: Record<string, ReactNode> = {
  home: (
    <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9 21v-6h6v6" />
  ),
  heart: (
    <>
      <path d="M19.5 12.6 12 20l-7.5-7.4a5 5 0 1 1 7.5-6.6 5 5 0 1 1 7.5 6.6Z" />
      <path d="M3.5 12h4l1.5-2.5 3 5 1.5-2.5h4.5" />
    </>
  ),
  pill: (
    <>
      <rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-45 12 12)" />
      <path d="m8.5 8.5 7 7" />
    </>
  ),
  activity: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  food: (
    <>
      <path d="M7 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M9 3v18M16 3c-2 1.5-3 4-3 7v4h3v7" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />,
  habits: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </>
  ),
  chat: (
    <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" />
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  report: (
    <>
      <path d="M6 3h9l4 4v14H6V3Z" />
      <path d="M14 3v5h5M9 13h7M9 17h7" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.6a3.5 3.5 0 0 1 0 6.8M17.5 14.4c2.1.8 3.5 2.7 3.5 5.1" />
    </>
  ),
  device: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2Z" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2-2.5 3.3M12 17h.01" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  warning: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9.5V14M12 17h.01" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  logout: (
    <>
      <path d="M14 4H6v16h8M10 12h11M18 8.5 21.5 12 18 15.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
}

export function Icon({
  name,
  className = 'h-6 w-6',
}: {
  name: string
  className?: string
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name] ?? null}
    </svg>
  )
}

/* ============================== Button ============================== */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  href?: string
}

const BUTTON_BASE =
  'btn inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-semibold ' +
  'min-h-[var(--tap-target)] px-6 text-lg leading-snug transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--primary)] text-[var(--primary-contrast)] hover:bg-[var(--primary-hover)] border border-transparent',
  secondary:
    'bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--surface-secondary)]',
  danger:
    'bg-[var(--danger)] text-white hover:brightness-110 border border-transparent',
  success:
    'bg-[var(--success)] text-white hover:brightness-110 border border-transparent',
  ghost:
    'bg-transparent text-[var(--primary)] hover:bg-[var(--surface-secondary)] border border-transparent underline-offset-4 hover:underline',
}

export function Button({
  variant = 'primary',
  href,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const classes = `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`
  if (href) {
    const { ...anchorProps } = rest as AnchorHTMLAttributes<HTMLAnchorElement>
    return (
      <Link href={href} className={classes} {...anchorProps}>
        {children}
      </Link>
    )
  }
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  )
}

/* ============================== Card ============================== */

export function Card({
  children,
  className = '',
  labelledBy,
}: {
  children: ReactNode
  className?: string
  labelledBy?: string
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={`card rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 ${className}`}
      style={{ boxShadow: 'var(--shadow)' }}
    >
      {children}
    </section>
  )
}

/* ============================== Inputs ============================== */

interface FieldProps {
  label: string
  error?: string
  hint?: string
}

export function Input({
  label,
  error,
  hint,
  id,
  className = '',
  ...rest
}: FieldProps &
  InputHTMLAttributes<HTMLInputElement> & { id?: string }) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-lg font-semibold">
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={hint ? `${fieldId}-hint` : undefined}
        className={`min-h-[var(--tap-target)] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 text-lg text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] ${className}`}
        {...rest}
      />
      {hint && (
        <p id={`${fieldId}-hint`} className="text-base text-[var(--text-secondary)]">
          {hint}
        </p>
      )}
      {error && (
        <p role="alert" className="text-base font-semibold text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  )
}

export function Select({
  label,
  error,
  hint,
  id,
  children,
  className = '',
  ...rest
}: FieldProps &
  SelectHTMLAttributes<HTMLSelectElement> & { id?: string }) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-lg font-semibold">
        {label}
      </label>
      <select
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={hint ? `${fieldId}-hint` : undefined}
        className={`min-h-[var(--tap-target)] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 text-lg text-[var(--text-primary)] ${className}`}
        {...rest}
      >
        {children}
      </select>
      {hint && (
        <p id={`${fieldId}-hint`} className="text-base text-[var(--text-secondary)]">
          {hint}
        </p>
      )}
      {error && (
        <p role="alert" className="text-base font-semibold text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  )
}

/* ============================== Toggle ============================== */

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-left min-h-[var(--tap-target)]"
    >
      <span>
        <span className="block text-lg font-semibold">{label}</span>
        {description && (
          <span className="block text-base text-[var(--text-secondary)]">
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-[var(--primary)]' : 'bg-[var(--surface-secondary)]'
        } border border-[var(--border)]`}
      >
        <span
          className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </span>
    </button>
  )
}

/* ============================== Modal ============================== */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
      // Simple focus trap: keep Tab cycling inside the dialog.
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey, true)
    document.body.style.overflow = 'hidden'
    // Focus the dialog itself first.
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`w-full bg-[var(--surface)] p-6 outline-none rounded-t-3xl sm:rounded-3xl ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        } max-h-[90vh] overflow-y-auto border border-[var(--border)]`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-2xl font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border)] hover:bg-[var(--surface-secondary)]"
          >
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ============================== EmptyState / PageHeader ============================== */

export function EmptyState({
  icon = 'heart',
  title,
  description,
  action,
}: {
  icon?: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-[var(--primary)]">
        <Icon name={icon} className="h-8 w-8" />
      </span>
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="max-w-md text-lg text-[var(--text-secondary)]">{description}</p>
      {action}
    </Card>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-lg text-[var(--text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  )
}

/* ============================== App shell ============================== */

interface NavItem {
  href: string
  label: string
  icon: string
}

interface NavSection {
  title: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Home',
    items: [
      { href: '/home', label: 'Home', icon: 'home' },
      { href: '/bp', label: 'Blood Pressure', icon: 'heart' },
    ],
  },
  {
    title: 'My Health',
    items: [
      { href: '/medications', label: 'Medicine', icon: 'pill' },
      { href: '/activity', label: 'Activity', icon: 'activity' },
      { href: '/food', label: 'Food', icon: 'food' },
      { href: '/sleep', label: 'Sleep', icon: 'moon' },
      { href: '/habits', label: 'Habits', icon: 'habits' },
    ],
  },
  {
    title: 'Support',
    items: [
      { href: '/guide', label: 'AI Chat', icon: 'chat' },
      { href: '/appointments', label: 'Appointments', icon: 'calendar' },
      { href: '/reports', label: 'Reports', icon: 'report' },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/care-team', label: 'Care Team', icon: 'users' },
      { href: '/devices', label: 'Devices', icon: 'device' },
      { href: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
]

const BOTTOM_NAV: NavItem[] = [
  { href: '/home', label: 'Home', icon: 'home' },
  { href: '/bp', label: 'BP', icon: 'heart' },
  { href: '/medications', label: 'Medicine', icon: 'pill' },
  { href: '/guide', label: 'AI Chat', icon: 'chat' },
]

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      style={active ? { background: 'var(--sidebar-active)' } : undefined}
      className="flex min-h-[var(--tap-target)] items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-lg font-medium text-[var(--sidebar-text)] transition-colors hover:bg-[var(--sidebar-hover)]"
    >
      <Icon name={item.icon} className="h-6 w-6 shrink-0" />
      <span>{item.label}</span>
    </Link>
  )
}

function SidebarContent({
  pathname,
  userName,
  onLogout,
  onNavigate,
}: {
  pathname: string
  userName: string | null
  onLogout: () => void
  onNavigate?: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-2 pt-6">
        <LogoMark size={44} />
        <div>
          <p className="text-xl font-extrabold leading-tight text-[var(--sidebar-text)]">
            Steady
          </p>
          <p className="text-sm text-[var(--sidebar-text-dim)]">
            {userName ? `Hello, ${userName}` : 'Your daily companion'}
          </p>
        </div>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-5">
            <p className="px-4 pb-1 text-xs font-bold uppercase tracking-widest text-[var(--sidebar-text-dim)]">
              {section.title}
            </p>
            <ul className="flex flex-col gap-1">
              {section.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    active={pathname === item.href}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div
        className="flex flex-col gap-3 border-t p-4"
        style={{ borderColor: 'rgba(255,255,255,0.15)' }}
      >
        <Link
          href="/get-help"
          onClick={onNavigate}
          className="flex min-h-[var(--tap-target)] items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--danger)] px-4 text-lg font-bold text-white hover:brightness-110"
        >
          <Icon name="help" className="h-6 w-6" />
          Get Help
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="flex min-h-[var(--tap-target)] items-center justify-center gap-2 rounded-[var(--radius)] px-4 text-base font-medium text-[var(--sidebar-text-dim)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text)]"
        >
          <Icon name="logout" className="h-5 w-5" />
          Sign out
        </button>
      </div>

      {/* Discreet feedback entry point — visually separated, low emphasis. */}
      <div
        className="border-t px-4 py-2"
        style={{ borderColor: 'rgba(255,255,255,0.15)' }}
      >
        <FeedbackButton variant="sidebar" />
      </div>
    </div>
  )
}

export function AppShell({
  userId,
  userName,
  children,
}: {
  userId: string
  userName: string | null
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [guardReady, setGuardReady] = useState(false)

  // Onboarding guard: users who have not finished setup go to /onboarding.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('profiles')
          .select('onboarding_state')
          .eq('id', userId)
          .maybeSingle()
        const status =
          (data?.onboarding_state as { status?: string } | null)?.status ??
          'not_started'
        if (cancelled) return
        if (status !== 'done' && pathname !== '/onboarding') {
          router.replace('/onboarding')
        } else if (status === 'done' && pathname === '/onboarding') {
          router.replace('/home')
        }
      } catch {
        /* If the check fails, show the app rather than trapping the user. */
      } finally {
        if (!cancelled) setGuardReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pathname, router, userId])

  const handleLogout = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    // Full reload: clears all client state so the next visit starts clean.
    // (The login page remembers the email on this device separately.)
    window.location.href = '/login'
  }, [])

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-[var(--surface)] focus:px-4 focus:py-3 focus:text-lg focus:font-bold"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden w-72 bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] lg:block"
        aria-label="App navigation"
      >
        <SidebarContent
          pathname={pathname}
          userName={userName}
          onLogout={handleLogout}
        />
      </aside>

      <div className="lg:pl-72">
        <main id="main-content" className="mx-auto w-full max-w-3xl px-4 pb-32 pt-6 sm:px-6 lg:px-8 lg:pb-16">
          {guardReady ? (
            children
          ) : (
            <div className="flex min-h-[50vh] items-center justify-center">
              <p className="text-lg text-[var(--text-secondary)]">Loading…</p>
            </div>
          )}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)] lg:hidden"
        style={{ boxShadow: 'var(--shadow)' }}
      >
        <ul className="grid grid-cols-5">
          {BOTTOM_NAV.map((item) => {
            const active = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[64px] flex-col items-center justify-center gap-1 text-sm font-semibold ${
                    active
                      ? 'text-[var(--primary)]'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  <Icon name={item.icon} className="h-6 w-6" />
                  {item.label}
                </Link>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-haspopup="dialog"
              className="flex min-h-[64px] w-full flex-col items-center justify-center gap-1 text-sm font-semibold text-[var(--text-secondary)]"
            >
              <Icon name="menu" className="h-6 w-6" />
              More
            </button>
          </li>
        </ul>
      </nav>

      {/* Small, unobtrusive feedback action on mobile, above the bottom nav. */}
      <FeedbackButton variant="floating" />

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="All sections" wide>
        <div
          className="-m-6 max-h-[70vh] overflow-y-auto bg-[var(--sidebar-bg)] p-6 text-[var(--sidebar-text)]"
        >
          <SidebarContent
            pathname={pathname}
            userName={userName}
            onLogout={handleLogout}
            onNavigate={() => setMenuOpen(false)}
          />
        </div>
      </Modal>
    </div>
  )
}

/* ============================== Next Best Action card ============================== */

const ACTION_ICONS: Record<string, { icon: string; tone: string }> = {
  safety_review: { icon: 'warning', tone: 'text-[var(--danger)] bg-[var(--danger)]/10' },
  appointment_prep: { icon: 'calendar', tone: 'text-[var(--primary)] bg-[var(--primary)]/10' },
  medication: { icon: 'pill', tone: 'text-[var(--primary)] bg-[var(--primary)]/10' },
  bp_morning: { icon: 'heart', tone: 'text-[var(--danger)] bg-[var(--danger)]/10' },
  bp_evening: { icon: 'heart', tone: 'text-[var(--danger)] bg-[var(--danger)]/10' },
  craving_support: { icon: 'habits', tone: 'text-[var(--warning)] bg-[var(--warning)]/10' },
  activity: { icon: 'activity', tone: 'text-[var(--success)] bg-[var(--success)]/10' },
  check_in: { icon: 'chat', tone: 'text-[var(--primary)] bg-[var(--primary)]/10' },
  caught_up: { icon: 'check', tone: 'text-[var(--success)] bg-[var(--success)]/10' },
}

/** One "next step" card, powered by GET /api/next-action. */
export function NextStepCard() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [action, setAction] = useState<NextAction | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const res = await fetch('/api/next-action', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as NextAction
      setAction(data)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (status === 'loading') {
    return (
      <Card aria-busy="true">
        <p className="text-lg text-[var(--text-secondary)]">
          Finding your next step…
        </p>
      </Card>
    )
  }

  if (status === 'error' || !action) {
    return (
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-[var(--text-secondary)]">
              <Icon name="warning" className="h-6 w-6" />
            </span>
            <h2 className="text-xl font-bold">Your next step</h2>
          </div>
          <p className="text-lg">
            We couldn&rsquo;t load your next step right now.
          </p>
          <Button variant="secondary" onClick={load}>
            Try Again
          </Button>
        </div>
      </Card>
    )
  }

  const visual = ACTION_ICONS[action.kind] ?? ACTION_ICONS.caught_up

  return (
    <Card labelledBy="next-step-title">
      <p className="mb-3 text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)]">
        Your next step
      </p>
      <div className="flex items-start gap-4">
        <span
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${visual.tone}`}
        >
          <Icon name={visual.icon} className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <h2 id="next-step-title" className="text-2xl font-bold leading-tight">
            {action.title}
          </h2>
          <p className="mt-1 text-lg text-[var(--text-secondary)]">
            {action.detail}
          </p>
        </div>
      </div>
      {action.why && (
        <p className="mt-4 rounded-[var(--radius)] bg-[var(--surface-secondary)] p-3 text-base text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">Why? </span>
          {action.why}
        </p>
      )}
      <div className="mt-5">
        <Button href={action.cta_href} className="w-full sm:w-auto">
          {action.cta_label}
          <Icon name="chevronRight" className="h-5 w-5" />
        </Button>
      </div>
    </Card>
  )
}

/* ============================== Feeling quick check ============================== */

const MOODS = ['Good', 'Okay', 'Not great', 'Stressed'] as const

/** One-tap "How are you feeling?" check-in that writes to stress_logs. */
export function FeelingCheck() {
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const log = useCallback(async (mood: string) => {
    setSaving(mood)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('stress_logs').insert({ user_id: user.id, mood })
      }
      setSaved(true)
    } catch {
      /* A failed check-in is not worth blocking the user over. */
      setSaved(true)
    } finally {
      setSaving(null)
    }
  }, [])

  return (
    <Card labelledBy="feeling-title">
      <h2 id="feeling-title" className="text-xl font-bold">
        How are you feeling?
      </h2>
      {saved ? (
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="flex items-center gap-2 text-lg text-[var(--success)]">
            <Icon name="check" className="h-6 w-6" />
            Thanks for checking in.
          </p>
          <Button variant="ghost" onClick={() => setSaved(false)}>
            Change
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {MOODS.map((mood) => (
            <button
              key={mood}
              type="button"
              disabled={saving !== null}
              onClick={() => log(mood)}
              className="min-h-[var(--tap-target)] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-lg font-semibold hover:bg-[var(--surface-secondary)] disabled:opacity-60"
            >
              {saving === mood ? 'Saving…' : mood}
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}
