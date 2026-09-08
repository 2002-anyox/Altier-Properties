import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { KeyRound, LogIn, ShieldCheck } from 'lucide-react'
import { Button, Field, Input, PasswordField, cx } from '../components/ui'
import { Wordmark } from '../components/layout/Wordmark.js'
import { useStore } from '../lib/store.js'
import { SsoButtons, rememberSignIn, useSsoProviders } from '../components/auth/SsoButtons.js'
import { goTo } from '../lib/hash.js'

/**
 * The door. Two states: an ordinary sign-in, and — on a database where no
 * account has a password yet — creating the owner. That second state
 * closes for good the moment the first password exists, so it is a
 * bootstrap rather than a registration form.
 */
export default function SignIn() {
  const { state, signIn, createOwner, ssoError, clearSsoError } = useStore()
  const setup = state.setupNeeded
  const providers = useSsoProviders()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [help, setHelp] = useState(false)
  /* Focus lands on the failure when one arrives, so a screen reader
     reader is put at the problem rather than left wherever they were. */
  const errorRef = useRef<HTMLDivElement>(null)

  /* A failed Google or Apple attempt came back as a page load, so it is
     already waiting rather than being raised by anything on this screen. */
  const shown = error ?? ssoError

  const mismatch = setup && confirm.length > 0 && password !== confirm
  const emailLooksRight = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const ready = setup
    ? name.trim().length > 1 && emailLooksRight && password.length >= 10 && password === confirm
    : email.trim().length > 0 && password.length > 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || busy) return  // the button is aria-disabled, not disabled
    setBusy(true)
    setError(null)
    clearSsoError()
    try {
      if (setup) {
        await createOwner({
          name: name.trim(), email: email.trim(), password, token: token.trim() || undefined,
        })
      } else {
        await signIn(email, password)
      }
      rememberSignIn('password')
    } catch (err) {
      setError((err as Error).message)
      /* The password goes, because it was wrong and retyping it is the
         next step. The email stays, because it probably was not. */
      setPassword('')
      setConfirm('')
    } finally {
      setBusy(false)
    }
  }

  /* Announced by the live region, then read again where focus lands. */
  useEffect(() => {
    if (shown) errorRef.current?.focus()
  }, [shown])

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[400px]"
      >
        <div className="mb-7 flex justify-center">
          {/* The wordmark goes home. Somebody who followed "Sign In" from
              the landing page and then thought better of it should not
              have to reach for the back button. */}
          <a
            href="#/"
            onClick={(e) => { e.preventDefault(); goTo('#/') }}
            aria-label="Back to the Altier Properties site"
            className="rounded-2xl bg-surface-rail px-5 py-4 ring-1 ring-white/10 transition-shadow duration-200 hover:ring-white/25"
          >
            <Wordmark />
          </a>
        </div>

        <div className="card card-pad">
          <h1 className="font-display text-[22px] font-semibold leading-tight text-ink">
            {setup ? 'Create your account' : 'Sign in'}
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
            {setup
              ? 'This portfolio is empty and nobody can sign in yet. The account you make here is the owner, and this page will not offer it again.'
              : 'This portfolio holds client records. Sign in to continue.'}
          </p>

          {/* Above the form, with a divider. Somebody who signed up with
              Google and meets an email box first starts typing, spots the
              button, and now has to work out which account they used —
              which is exactly how duplicate accounts get made. */}
          {!setup && providers.length > 0 && (
            <div className="mb-5">
              <SsoButtons
                providers={providers}
                showLastUsed
                disabled={busy || leaving}
                onPick={() => { setLeaving(true); clearSsoError() }}
              />
              <p className="mt-2.5 text-center text-[12px] leading-relaxed text-ink-muted">
                Works once an owner has put that address on your team account.
              </p>
              <div className="mt-5 flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-line" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">or</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 grid gap-4">
            {setup && (
              <Field label="Your name" id="si-name">
                <Input
                  id="si-name" autoComplete="name" autoFocus
                  value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                />
              </Field>
            )}

            <Field
              label="Email"
              id="si-email"
              hint={setup ? 'You sign in with this, and it is what a linked Google or Apple account is matched against.' : undefined}
            >
              {/* autoComplete="username", not "email": password managers
                  key the saved pair off username. And the three off
                  switches, because a phone capitalising an email address
                  is the commonest reason a correct one is refused. */}
              <Input
                id="si-email" name="si-email" type="email" autoComplete="username"
                autoFocus={!setup}
                autoCapitalize="off" autoCorrect="off" spellCheck={false}
                aria-invalid={!!shown || undefined}
                value={email} onChange={(e) => { setEmail(e.target.value); if (error) setError(null) }}
                placeholder="you@example.com"
              />
            </Field>

            <Field
              label={setup ? 'Choose a password' : 'Password'}
              id="si-password"
              hint={setup ? 'At least 10 characters. Length beats punctuation.' : undefined}
              action={setup ? undefined : (
                <button
                  type="button"
                  onClick={() => setHelp((v) => !v)}
                  aria-expanded={help}
                  className="text-[12px] font-medium text-gold-ink underline-offset-2 hover:underline"
                >
                  Forgot password?
                </button>
              )}
            >
              <PasswordField
                id="si-password"
                autoComplete={setup ? 'new-password' : 'current-password'}
                invalid={!!shown}
                value={password}
                onChange={(v) => { setPassword(v); if (error) setError(null) }}
              />
            </Field>

            {help && !setup && (
              <p className="rounded-xl border border-line bg-surface-inset/60 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-secondary">
                There is no self-service reset: Altier sends no email, so a reset
                link would have nowhere to go. An owner can set a new password for
                you from <span className="font-medium text-ink">Team &amp; access</span>,
                and it takes them about ten seconds. If you are the owner and locked
                out, whoever administers your database can do it directly.
              </p>
            )}

            {setup && (
              <>
                <Field label="Confirm it" id="si-confirm" error={mismatch ? 'Those two do not match.' : undefined}>
                  <PasswordField
                    id="si-confirm" autoComplete="new-password"
                    invalid={mismatch}
                    value={confirm} onChange={setConfirm}
                  />
                </Field>
                <Field label="Setup token" id="si-token" hint="Only if SETUP_TOKEN was set on the server. Leave blank otherwise.">
                  <Input id="si-token" value={token} onChange={(e) => setToken(e.target.value)} />
                </Field>
              </>
            )}

            {/* In the DOM from the first render, empty. A live region
                created at the same moment as its content is a live region
                most screen readers never announce. role="alert" is
                assertive already, so there is no aria-live beside it —
                the two together make some readers say it twice. */}
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

            {/* aria-disabled rather than disabled: a disabled button
                leaves the tab order, so the keyboard user who just
                pressed it loses their place. The guard is the early
                return in submit(), which is where it belongs anyway. */}
            <Button
              type="submit"
              variant="primary"
              block
              className={cx('mt-1', (!ready || busy) && 'opacity-45')}
              icon={setup ? <KeyRound size={15} /> : <LogIn size={15} />}
              aria-disabled={!ready || busy}
            >
              {busy ? 'One moment…' : setup ? 'Create account and sign in' : 'Sign in'}
            </Button>

            {/* Said once, out of the way, so the press is confirmed to
                somebody who cannot see the button change. */}
            <span aria-live="polite" className="sr-only">
              {busy ? 'Signing in, one moment.' : ''}
            </span>
          </form>

        </div>

        <p className="mt-5 flex items-start gap-2 px-1 text-[12px] leading-relaxed text-ink-muted">
          <ShieldCheck size={14} className="mt-px shrink-0" aria-hidden />
          <span>
            {setup
              ? 'Do this now, before sharing the address. Until an account exists, whoever opens this page can make themselves the owner.'
              : 'Sessions last two weeks. Changing your password signs out every other device.'}
          </span>
        </p>
      </motion.div>
    </div>
  )
}
