import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, UserCheck } from 'lucide-react'
import { Button, Field, Input } from '../components/ui'
import { Wordmark } from '../components/layout/Wordmark.js'
import { auth } from '../lib/api.js'
import { roleLabel } from '../lib/rbac.js'

interface Offer {
  organization: string
  email: string
  role: string
  title: string
  expiresAt: string
}

/**
 * The far end of an invitation link.
 *
 * Reached without a session, because the person following it does not
 * have one yet — the token in the address is the credential, and the
 * server checks it against a hash and spends it once. Nothing here asks
 * which workspace or which role: both come from the row the inviter
 * wrote, so there is nothing on this screen worth tampering with.
 */
export default function Join({ token }: { token: string }) {
  const [offer, setOffer] = useState<Offer | null>(null)
  const [hasAccount, setHasAccount] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    auth.invitation(token)
      .then((res) => {
        if (!live) return
        setOffer(res.invitation as Offer)
        setHasAccount(res.hasAccount)
      })
      .catch((error: Error) => { if (live) setProblem(error.message) })
    return () => { live = false }
  }, [token])

  const ready = hasAccount ? true : name.trim().length > 1 && password.length >= 10

  const accept = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setProblem(null)
    try {
      await auth.join(token, {
        name: name.trim() || undefined,
        password: password || undefined,
      })
      /* A full reload rather than a route change: the session cookie is
         new, and everything the app holds was loaded without it. */
      window.location.assign(window.location.pathname)
    } catch (error) {
      setProblem((error as Error).message)
      setPassword('')
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
          {!offer && !problem && (
            <p className="text-[13px] text-ink-muted">Checking that invitation…</p>
          )}

          {problem && !offer && (
            <>
              <span
                className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[rgb(var(--c-status-critical)/0.12)] text-[rgb(var(--c-status-critical))]"
                aria-hidden
              >
                <AlertTriangle size={19} />
              </span>
              <h1 className="font-display text-[21px] font-semibold leading-tight text-ink">
                That invitation cannot be used
              </h1>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-secondary">{problem}</p>
              <Button
                variant="secondary" block className="mt-6"
                onClick={() => window.location.assign(window.location.pathname)}
              >
                Go to sign in
              </Button>
            </>
          )}

          {offer && (
            <>
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-gold-soft text-gold-ink" aria-hidden>
                <UserCheck size={19} />
              </span>
              <h1 className="font-display text-[22px] font-semibold leading-tight text-ink">
                Join {offer.organization}
              </h1>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-secondary">
                You have been invited as {roleLabel(offer.role as never).toLowerCase()}
                {offer.title ? `, ${offer.title.toLowerCase()}` : ''}. This link was sent
                to <span className="text-ink">{offer.email}</span> and works once.
              </p>

              <form onSubmit={accept} className="mt-6 grid gap-4">
                {!hasAccount && (
                  <>
                    <Field label="Your name" id="jn-name">
                      <Input
                        id="jn-name" autoComplete="name" autoFocus
                        value={name} onChange={(e) => setName(e.target.value)}
                        placeholder="Your full name"
                      />
                    </Field>
                    <Field
                      label="Choose a password"
                      id="jn-password"
                      hint="At least 10 characters. Length beats punctuation."
                    >
                      <Input
                        id="jn-password" type="password" autoComplete="new-password"
                        value={password} onChange={(e) => setPassword(e.target.value)}
                      />
                    </Field>
                  </>
                )}

                {hasAccount && (
                  <p className="rounded-xl border border-line bg-surface-inset/60 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-secondary">
                    You already have an Altier account at that address. Accepting adds
                    this workspace to it — your password does not change.
                  </p>
                )}

                {problem && (
                  <p className="text-[12.5px] leading-relaxed text-[rgb(var(--c-status-critical))]" role="alert">
                    {problem}
                  </p>
                )}

                <Button type="submit" variant="primary" block disabled={!ready || busy}>
                  {busy ? 'Joining…' : 'Accept invitation'}
                </Button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
