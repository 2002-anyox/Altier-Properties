import { useState } from 'react'
import { motion } from 'framer-motion'
import { KeyRound, LogIn, ShieldCheck } from 'lucide-react'
import { Button, Field, Input } from '../components/ui'
import { Wordmark } from '../components/layout/Wordmark'
import { useStore } from '../lib/store'
import { SsoButtons, useSsoProviders } from '../components/auth/SsoButtons'

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
    if (!ready || busy) return
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
    } catch (err) {
      setError((err as Error).message)
      setPassword('')
      setConfirm('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[400px]"
      >
        <div className="mb-7 flex justify-center">
          <span className="rounded-2xl bg-surface-rail px-5 py-4 ring-1 ring-white/10">
            <Wordmark />
          </span>
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

          <form onSubmit={submit} className="mt-6 grid gap-4">
            {setup && (
              <Field label="Your name" id="si-name">
                <Input
                  id="si-name" autoComplete="name" autoFocus
                  value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ronald Okello"
                />
              </Field>
            )}

            <Field
              label="Email"
              id="si-email"
              hint={setup ? 'You sign in with this, and it is what a linked Google or Apple account is matched against.' : undefined}
            >
              <Input
                id="si-email" type="email" autoComplete="username" autoFocus={!setup}
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>

            <Field
              label={setup ? 'Choose a password' : 'Password'}
              id="si-password"
              hint={setup ? 'At least 10 characters. Length beats punctuation.' : undefined}
            >
              <Input
                id="si-password" type="password"
                autoComplete={setup ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {setup && (
              <>
                <Field label="Confirm it" id="si-confirm" error={mismatch ? 'Those two do not match.' : undefined}>
                  <Input
                    id="si-confirm" type="password" autoComplete="new-password"
                    value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  />
                </Field>
                <Field label="Setup token" id="si-token" hint="Only if SETUP_TOKEN was set on the server. Leave blank otherwise.">
                  <Input id="si-token" value={token} onChange={(e) => setToken(e.target.value)} />
                </Field>
              </>
            )}

            {shown && (
              <p
                role="alert"
                className="rounded-xl border border-[rgb(var(--c-status-critical)/0.35)] bg-[rgb(var(--c-status-critical)/0.08)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[rgb(var(--c-status-critical))]"
              >
                {shown}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              block
              className="mt-1"
              icon={setup ? <KeyRound size={15} /> : <LogIn size={15} />}
              disabled={!ready || busy}
            >
              {busy ? 'One moment…' : setup ? 'Create account and sign in' : 'Sign in'}
            </Button>
          </form>

          {/* Only after the owner exists: until then there is nobody for a
              Google or Apple account to be. */}
          {!setup && providers.length > 0 && (
            <>
              <div className="my-5 flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-line" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">or</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <SsoButtons
                providers={providers}
                disabled={busy || leaving}
                onPick={() => { setLeaving(true); clearSsoError() }}
              />
              <p className="mt-3 text-center text-[12px] leading-relaxed text-ink-muted">
                Works when an owner has already put that address on your team account.
              </p>
            </>
          )}
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
