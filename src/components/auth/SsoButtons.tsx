import { useEffect, useState } from 'react'
import { auth, type SsoProvider } from '../../lib/api.js'

/**
 * The marks, drawn rather than fetched.
 *
 * Both providers require their own logo on the button, and both forbid
 * altering it — so these are the official paths, inlined so the button
 * cannot render half-formed while an image loads.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="17" height="17" aria-hidden focusable="false">
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

/**
 * One button per configured provider. `verb` differs by context: the
 * sign-in screen continues *with* an account, Settings connects one to
 * an account that already exists.
 */
export function SsoButtons({
  providers, verb = 'Continue with', disabled, onPick,
}: {
  providers: SsoProvider[]
  verb?: string
  disabled?: boolean
  onPick?: (id: string) => void
}) {
  if (providers.length === 0) return null
  return (
    <div className="grid gap-2.5">
      {providers.map((p) => {
        const Mark = MARKS[p.id] ?? (() => null)
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => { onPick?.(p.id); auth.startSso(p.id) }}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-surface-inset px-4 text-[13.5px] font-medium text-ink transition-colors hover:bg-surface-rail focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Mark />
            <span>{verb} {p.label}</span>
          </button>
        )
      })}
    </div>
  )
}
