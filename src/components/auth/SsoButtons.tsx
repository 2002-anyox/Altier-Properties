import { useEffect, useState } from 'react'
import { auth, type SsoProvider } from '../../lib/api.js'
import { cx } from '../ui'

/**
 * The marks, drawn rather than fetched.
 *
 * Both providers require their own logo on the button, and both forbid
 * altering it — so these are the official paths, inlined so the button
 * cannot render half-formed while an image loads.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden focusable="false">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  )
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden focusable="false">
      <path d="M16.365 1.43c0 1.14-.468 2.246-1.226 3.05-.795.85-2.1 1.51-3.155 1.42-.128-1.117.44-2.29 1.176-3.05.74-.77 2.02-1.35 3.205-1.42zM20.68 17.28c-.552 1.276-.818 1.846-1.53 2.973-.99 1.57-2.39 3.53-4.12 3.545-1.54.014-1.94-1.003-4.03-.99-2.09.012-2.527 1.008-4.07.994-1.73-.015-3.056-1.784-4.047-3.354C.113 16.05-.184 10.9 1.53 8.17c1.22-1.94 3.14-3.075 4.95-3.075 1.84 0 3 1.014 4.52 1.014 1.48 0 2.38-1.016 4.51-1.016 1.61 0 3.32.88 4.54 2.4-3.99 2.19-3.34 7.89.63 9.787z" />
    </svg>
  )
}

const MARKS: Record<string, () => JSX.Element> = { google: GoogleMark, apple: AppleMark }

/**
 * Asks the server which methods this deployment actually has keys for.
 * Nothing is drawn speculatively: a Google button that cannot work is
 * worse than no Google button.
 */
export function useSsoProviders() {
  const [providers, setProviders] = useState<SsoProvider[]>([])
  useEffect(() => {
    let cancelled = false
    auth.providers()
      .then(({ providers: list }) => { if (!cancelled) setProviders(list) })
      .catch(() => { /* none offered, which is a valid answer */ })
    return () => { cancelled = true }
  }, [])
  return providers
}

/* Which method opened this browser last. Not personal data, and it
   survives signing out — its whole job is to stop somebody who signed up
   with Google typing an email address and creating a second account. */
const LAST_USED = 'altier.lastSignIn'

export const rememberSignIn = (method: string) => {
  try { window.localStorage.setItem(LAST_USED, method) } catch { /* private window */ }
}

export function useLastSignIn(): string | null {
  const [last, setLast] = useState<string | null>(null)
  useEffect(() => {
    try { setLast(window.localStorage.getItem(LAST_USED)) } catch { /* fine */ }
  }, [])
  return last
}

function LastUsed() {
  return (
    <span className="ml-auto shrink-0 rounded-full bg-gold-soft px-2 py-0.5 text-[10.5px] font-semibold text-gold-ink">
      Last used
    </span>
  )
}

/**
 * One button per configured provider.
 *
 * Google requires its own button to follow its brand guidelines, and
 * requires it for app verification: 40px tall, its own mark unaltered
 * and uncoloured, Roboto at 14px/500, and the approved wording. The
 * measurements here match what Google's own button configurator emits.
 * Generate from that configurator if you ever need to defend them.
 *
 * `verb` differs by context: the sign-in screen continues *with* an
 * account, Settings connects one to an account that already exists.
 */
export function SsoButtons({
  providers, verb = 'Continue with', disabled, onPick, showLastUsed,
}: {
  providers: SsoProvider[]
  verb?: string
  disabled?: boolean
  onPick?: (id: string) => void
  /** Only on the sign-in screen; meaningless when linking an account. */
  showLastUsed?: boolean
}) {
  const last = useLastSignIn()
  if (providers.length === 0) return null
  return (
    <div className="grid gap-2.5">
      {providers.map((p) => {
        const Mark = MARKS[p.id] ?? (() => null)
        const isGoogle = p.id === 'google'
        return (
          <button
            key={p.id}
            type="button"
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (disabled) return
              rememberSignIn(p.id)
              onPick?.(p.id)
              auth.startSso(p.id)
            }}
            style={isGoogle
              ? { height: 40, borderRadius: 4, letterSpacing: '0.25px', fontFamily: "'Roboto', Inter, arial, sans-serif" }
              : undefined}
            className={cx(
              'flex w-full items-center gap-3 px-3 text-[14px] font-medium transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
              disabled && 'cursor-not-allowed opacity-55',
              isGoogle
                ? 'border border-line-strong bg-white text-[#1f1f1f] hover:bg-[#f8f9fa] dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:hover:bg-[#1c1c1d]'
                : 'h-11 rounded-xl border border-line bg-surface-inset text-ink hover:bg-surface-rail',
            )}
          >
            <Mark />
            <span>{verb} {p.label}</span>
            {showLastUsed && last === p.id && <LastUsed />}
          </button>
        )
      })}
    </div>
  )
}
