import { motion } from 'framer-motion'
import { Wordmark } from './Wordmark'
import { useStore } from '../../lib/store'
import SignIn from '../../pages/SignIn'

/* Held until the portfolio has arrived, so nobody reads a figure that is
   about to be replaced. With no API behind it the probe fails immediately
   and this is a single frame; against a database it is a short, calm wait. */
export function BootGate({ children }: { children: React.ReactNode }) {
  const { state } = useStore()

  /* A live API with nobody signed in is the door, not the dashboard. In
     demo mode there is no server to sign in to, so this never applies. */
  if (state.hydrated && state.source === 'database' && !state.member) return <SignIn />

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
