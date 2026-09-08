import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock, X } from 'lucide-react'
import { useStore } from '../../lib/store.js'
import { workspace, type SeatUsage } from '../../lib/api.js'
import { can } from '../../lib/rbac.js'
import { cx } from '../ui'
import { EASE } from '../../lib/motion.js'

/**
 * How long is left, and what happens when it runs out.
 *
 * A trial that expires silently is the worst version: somebody discovers
 * it at the moment they try to add a colleague and are refused, with no
 * warning that the clock was even running. This says so beforehand.
 *
 * Only for whoever can act on it. A manager cannot choose a plan, so
 * telling them the trial ends on Tuesday is just noise they cannot use.
 */
export function TrialBanner() {
  const { state } = useStore()
  const [seats, setSeats] = useState<SeatUsage | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const mayAct = can(state.role, 'manage:team')

  useEffect(() => {
    if (!mayAct || state.source !== 'database') return
    let cancelled = false
    workspace.read()
      .then((w) => { if (!cancelled) setSeats(w.seats) })
      .catch(() => { /* the banner is a courtesy, not a gate */ })
    return () => { cancelled = true }
  }, [mayAct, state.source])

  if (!seats || seats.status !== 'trialing') return null
  const left = seats.trialDaysLeft
  if (left === null) return null

  const over = !seats.open
  /* Quiet until it is nearly out. A banner every day for a week is a
     banner nobody reads on the day it matters. */
  if (!over && left > 3) return null
  if (dismissed && !over) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        role={over ? 'alert' : 'status'}
        className={cx(
          'flex items-center gap-3 border-b px-4 py-2.5 text-[13px] sm:px-6',
          over
            ? 'border-[rgb(var(--c-status-critical)/0.3)] bg-[rgb(var(--c-status-critical)/0.08)] text-[rgb(var(--c-status-critical))]'
            : 'border-line bg-gold-soft text-gold-ink',
        )}
      >
        <Clock size={15} className="shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 leading-snug">
          {over ? (
            <>
              <span className="font-semibold">Your free trial has ended.</span>{' '}
              Everything you have is still here and still readable. Choose a plan to
              add people again.
            </>
          ) : (
            <>
              <span className="font-semibold">
                {left === 0 ? 'Your trial ends today.' : left === 1 ? 'One day left on your trial.' : `${left} days left on your trial.`}
              </span>{' '}
              Nothing is lost when it ends — the workspace stays readable.
            </>
          )}
        </p>
        {!over && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 rounded-lg p-1 transition-colors hover:bg-black/5"
          >
            <X size={15} />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
