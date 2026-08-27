import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { KeyRound, LogIn, ShieldCheck } from 'lucide-react'
import { Button, Field, Input, Select } from '../components/ui'
import { Wordmark } from '../components/layout/Wordmark'
import { useStore } from '../lib/store'
import { auth } from '../lib/api'
import { SsoButtons, useSsoProviders } from '../components/auth/SsoButtons'
import type { Role } from '../lib/types'

interface Claimable { id: string; name: string; role: Role; title: string }

/**
 * The door. Two states: an ordinary sign-in, and — only while no account
 * anywhere has a password — a first-run claim that turns one of the seeded
 * team members into a real account. That window closes permanently the
 * moment the first password exists, so it cannot mint a second way in.
 */
export default function SignIn() {
  const { state, signIn, claimAccount, ssoError, clearSsoError } = useStore()
  const setup = state.setupNeeded
  const providers = useSsoProviders()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [token, setToken] = useState('')
  const [memberId, setMemberId] = useState('')
  const [claimable, setClaimable] = useState<Claimable[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)

  /* A failed Google or Apple attempt came back as a page load, so it is
     already waiting rather than being raised by anything on this screen. */
  const shown = error ?? ssoError

  useEffect(() => {
    if (!setup) return
    auth.claimable()
      .then(({ members }) => {
        setClaimable(members)
        setMemberId((current) => current || members.find((m) => m.role === 'owner')?.id || members[0]?.id || '')
      })
      .catch(() => setClaimable([]))
  }, [setup])

  const mismatch = setup && confirm.length > 0 && password !== confirm
  const ready = setup
    ? !!memberId && password.length >= 10 && password === confirm
    : email.trim().length > 0 && password.length > 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    clearSsoError()
    try {
      if (setup) await claimAccount(memberId, password, token.trim() || undefined)
      else await signIn(email, password)
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
            {setup ? 'Set up Altier' : 'Sign in'}
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
            {setup
              ? 'Nobody can sign in yet. Claim your account by giving it a password — this only appears once.'
              : 'This portfolio holds client records. Sign in to continue.'}
          </p>

          <form onSubmit={submit} className="mt-6 grid gap-4">
            {setup ? (
              <>
                <Field label="Which account is yours" id="si-member">
                  <Select id="si-member" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                    {claimable.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} — {m.title}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Choose a password" id="si-password" hint="At least 10 characters. Length beats punctuation.">
                  <Input
                    id="si-password" type="password" autoComplete="new-password" autoFocus
                    value={password} onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <Field
                  label="Confirm it"
                  id="si-confirm"
                  error={mismatch ? 'Those two do not match.' : undefined}
                >
                  <Input
                    id="si-confirm" type="password" autoComplete="new-password"
                    value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  />
                </Field>
                <Field label="Setup token" id="si-token" hint="Only if SETUP_TOKEN was set on the server. Leave blank otherwise.">
                  <Input id="si-token" value={token} onChange={(e) => setToken(e.target.value)} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Email" id="si-email">
                  <Input
                    id="si-email" type="email" autoComplete="username" autoFocus
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@altier.co.ug"
                  />
                </Field>
                <Field label="Password" id="si-password">
                  <Input
                    id="si-password" type="password" autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                  />
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
              {busy ? 'One moment…' : setup ? 'Claim account and sign in' : 'Sign in'}
            </Button>
          </form>

          {/* Only after the first account has a password: until then there
              is nobody for a Google or Apple account to *be*. */}
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
              ? 'Do this now, before sharing the address. Until an account has a password, anyone who finds this page can claim one.'
              : 'Sessions last two weeks. Changing your password signs out every other device.'}
          </span>
        </p>
      </motion.div>
    </div>
  )
}
