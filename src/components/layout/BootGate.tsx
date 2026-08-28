import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Wordmark } from './Wordmark.js'
import { Button } from '../ui'
import { useStore } from '../../lib/store.js'
import { diagnose, type Diagnosis } from '../../lib/api.js'
import SignIn from '../../pages/SignIn.js'
import Join from '../../pages/Join.js'

/**
 * Shown when there should be an API and there is not.
 *
 * The alternative — quietly serving the sample portfolio — is how a broken
 * connection string survives a week: everything looks right, and the
 * records are somebody else's. So this says what failed and where to look.
 */
function Unreachable() {
  const [found, setFound] = useState<Diagnosis | null>(null)
  useEffect(() => { void diagnose().then(setFound) }, [])

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[440px]"
      >
        <div className="mb-7 flex justify-center">
          <span className="rounded-2xl bg-surface-rail px-5 py-4 ring-1 ring-white/10">
            <Wordmark />
          </span>
        </div>
        <div className="card card-pad" role="alert">
          <span
            className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[rgb(var(--c-status-critical)/0.12)] text-[rgb(var(--c-status-critical))]"
            aria-hidden
          >
            <AlertTriangle size={19} />
          </span>
          <h1 className="font-display text-[21px] font-semibold leading-tight text-ink">
            The portfolio could not be loaded
          </h1>
          <p className="mt-2.5 break-words text-[13px] leading-relaxed text-ink-secondary">
            {found?.detail ?? 'Checking what went wrong…'}
          </p>
          {found?.remedy && (
            <p className="mt-3 rounded-xl border border-line bg-surface-inset/60 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-secondary">
              {found.remedy}
            </p>
          )}
          <p className="mt-4 text-[12.5px] leading-relaxed text-ink-muted">
            Nothing is shown rather than sample figures, so there is no chance of
            reading numbers that belong to nobody.{' '}
            <code className="text-ink-secondary">/api/health</code> has the server&rsquo;s
            own account of the problem.
          </p>
          <Button
            variant="primary"
            block
            className="mt-6"
            icon={<RefreshCw size={14} />}
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

/* Held until the portfolio has arrived, so nobody reads a figure that is
   about to be replaced. With no API behind it the probe fails immediately
   and this is a single frame; against a database it is a short, calm wait. */
export function BootGate({ children }: { children: React.ReactNode }) {
  const { state } = useStore()

  /* A fault is reported, never papered over with sample data. */
  if (state.hydrated && state.source === 'unreachable') return <Unreachable />

  /* An API with nobody signed in is the door, not the dashboard. */
  if (state.hydrated && state.source === 'database' && !state.member) {
    /* Except for somebody arriving on an invitation link, who has no
       account yet and would find the sign-in form a dead end. Read off
       the address rather than the router, because this runs above it. */
    const invitation = /^#\/join\/([A-Za-z0-9_-]+)/.exec(window.location.hash)
    if (invitation) return <Join token={invitation[1]!} />
    return <SignIn />
  }

  if (state.hydrated) return <>{children}</>

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface px-6" role="status" aria-live="polite">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center gap-5 text-center"
      >
        <span className="rounded-2xl bg-surface-rail px-5 py-4 ring-1 ring-white/10">
          <Wordmark />
        </span>
        <p className="text-[13px] text-ink-muted">Loading your portfolio…</p>
        <span className="h-[3px] w-40 overflow-hidden rounded-full bg-line" aria-hidden>
          <motion.span
            className="block h-full w-1/3 rounded-full bg-gold"
            animate={{ x: ['-100%', '300%'] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
          />
        </span>
      </motion.div>
    </div>
  )
}
