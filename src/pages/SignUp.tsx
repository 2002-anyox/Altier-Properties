import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Check, ShieldCheck } from 'lucide-react'
import { Button, Field, Input, PasswordField, cx } from '../components/ui'
import { Wordmark } from '../components/layout/Wordmark.js'
import { useStore } from '../lib/store.js'
import { SsoButtons, rememberSignIn, useSsoProviders } from '../components/auth/SsoButtons.js'
import { goTo } from '../lib/hash.js'
import { TRIAL_DAYS } from '../lib/plans.js'

/**
 * The front door.
 *
 * Until this existed the only ways in were an invitation or being the
 * very first account on an empty database — which was right while Altier
 * was one deployment for one company, and wrong the moment it grew
 * organizations, subscriptions and seats.
 *
 * Nothing about isolation changes here. This creates a new workspace and
 * can never join one that exists; the person signing up owns that one and
 * nothing else; and the database still decides every read they go on to
 * make. What changes is only that they need not be invited first.
 *
 * Google sits above the form, per the same reasoning as the sign-in page:
 * somebody who meets an email box first starts typing, spots the button,
 * and ends up with two accounts.
 */
export default function SignUp() {
  const { signUp, ssoError, clearSsoError } = useStore()
  const providers = useSsoProviders()

  const [name, setName] = useState('')
  const [workspace, setWorkspace] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)

  const shown = error ?? ssoError

  const emailLooksRight = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const ready = name.trim().length > 1 && emailLooksRight && password.length >= 10

  /* Said as they type rather than only on submit, because a rule you meet
     before pressing the button is not an error you had to make first. */
  const passwordNote = password.length === 0
    ? `At least 10 characters. Length beats punctuation.`
    : password.length < 10
      ? `${10 - password.length} more to go.`
      : 'Long enough.'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    clearSsoError()
    try {
      await signUp({
        name: name.trim(),
        email: email.trim(),
        password,
        organizationName: workspace.trim(),
      })
      rememberSignIn('password')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { if (shown) errorRef.current?.focus() }, [shown])

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[420px]"
      >
        <div className="mb-7 flex justify-center">
          <a
            href="#/"
            onClick={(ev) => { ev.preventDefault(); goTo('#/') }}
            aria-label="Back to the Altier Properties site"
            className="rounded-2xl bg-surface-rail px-5 py-4 ring-1 ring-white/10 transition-shadow duration-200 hover:ring-white/25"
          >
            <Wordmark />
          </a>
        </div>

        <div className="card card-pad">
          <h1 className="font-display text-[22px] font-semibold leading-tight text-ink">
            Start your {TRIAL_DAYS}-day trial
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
            Your own workspace, private from the first minute and empty until you
            fill it. No card to begin.
          </p>

          <ul className="mt-4 grid gap-1.5">
            {[
              'Unlimited properties and units',
              `${TRIAL_DAYS} days of everything, free`,
              'Tenant portals that never take a seat',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-secondary">
                <Check size={14} className="mt-0.5 shrink-0 text-gold-ink" aria-hidden />
                {line}
              </li>
            ))}
          </ul>

          {providers.length > 0 && (
            <div className="mt-6">
              <SsoButtons
                providers={providers}
                verb="Sign up with"
                disabled={busy || leaving}
                onPick={() => { setLeaving(true); clearSsoError() }}
              />
              <p className="mt-2.5 text-center text-[12px] leading-relaxed text-ink-muted">
                Only opens an account that already exists here.
              </p>
              <div className="mt-5 flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-line" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">or</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 grid gap-4">
            <Field label="Your name" id="su-name">
              <Input
                id="su-name" name="su-name" autoComplete="name" autoFocus
                value={name} onChange={(e) => { setName(e.target.value); if (error) setError(null) }}
                placeholder="Your full name"
              />
            </Field>

            <Field
              label="Workspace name"
              id="su-workspace"
              hint="What your team will see. Your own name is fine — you can change it later."
            >
              <Input
                id="su-workspace" name="su-workspace" autoComplete="organization"
                value={workspace} onChange={(e) => setWorkspace(e.target.value)}
                placeholder={name.trim() ? `${name.trim()}’s properties` : 'Kampala Lettings'}
              />
            </Field>

            <Field label="Email" id="su-email">
              <Input
                id="su-email" name="su-email" type="email" autoComplete="username"
                autoCapitalize="off" autoCorrect="off" spellCheck={false}
                value={email} onChange={(e) => { setEmail(e.target.value); if (error) setError(null) }}
                placeholder="you@example.com"
              />
            </Field>

            {/* One password field, no confirm box: web.dev is explicit that
                doubling the input costs more than it catches, and the
                reveal control is what replaces it. */}
            <Field label="Choose a password" id="su-password" hint={passwordNote}>
              <PasswordField
                id="su-password" autoComplete="new-password"
                value={password}
                onChange={(v) => { setPassword(v); if (error) setError(null) }}
              />
            </Field>

            <div
              ref={errorRef}
              role="alert"
              aria-atomic="true"
              tabIndex={-1}
              className={cx(
                'rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed outline-none',
                shown
                  ? 'border-[rgb(var(--c-status-critical)/0.35)] bg-[rgb(var(--c-status-critical)/0.08)] text-[rgb(var(--c-status-critical))]'
                  : 'sr-only border-transparent',
              )}
            >
              {shown}
            </div>

            <Button
              type="submit"
              variant="primary"
              block
              className={cx('mt-1', (!ready || busy) && 'opacity-45')}
              icon={<ArrowRight size={15} />}
              aria-disabled={!ready || busy}
            >
              {busy ? 'Setting things up…' : `Start my ${TRIAL_DAYS} days`}
            </Button>
            <span aria-live="polite" className="sr-only">
              {busy ? 'Creating your workspace, one moment.' : ''}
            </span>
          </form>

          <p className="mt-5 border-t border-line pt-4 text-center text-[13px] text-ink-secondary">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => goTo('#/signin')}
              className="font-medium text-gold-ink underline-offset-2 hover:underline"
            >
              Sign in
            </button>
          </p>
        </div>

        <p className="mt-5 flex items-start gap-2 px-1 text-[12px] leading-relaxed text-ink-muted">
          <ShieldCheck size={14} className="mt-px shrink-0" aria-hidden />
          <span>
            Your workspace is yours alone. Nothing in it is visible to any other
            customer, and the database enforces that rather than the interface.
          </span>
        </p>
      </motion.div>
    </div>
  )
}
