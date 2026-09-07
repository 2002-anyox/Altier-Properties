import { motion } from 'framer-motion'
import { EASE } from '../../lib/motion.js'

/* ------------------------------------------------------------------ *
 * Arriving
 *
 * The same rise the app uses when a page mounts — eight pixels and a
 * fade, on the one easing curve — fired as a section comes into view
 * rather than on load. Once only: a block that re-animates every time it
 * is scrolled past is a page that will not settle.
 *
 * MotionConfig at the root has reducedMotion="user", so this is a
 * straight fade for anyone who has asked for less movement, and the
 * stylesheet flattens the durations besides.
 * ------------------------------------------------------------------ */

export function Reveal({
  children, delay = 0, y = 14, className, as = 'div',
}: {
  children: React.ReactNode
  delay?: number
  y?: number
  className?: string
  as?: 'div' | 'section' | 'li' | 'header'
}) {
  const Tag = motion[as]
  return (
    <Tag
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      /* -12% keeps the reveal just ahead of the eye: it has finished by
         the time the block is properly on screen, rather than animating
         under the reader's nose. */
      viewport={{ once: true, margin: '-12% 0px -8% 0px' }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      className={className}
    >
      {children}
    </Tag>
  )
}

/** A group whose children arrive one after another, briefly. */
export function RevealGroup({
  children, className, as = 'div',
}: { children: React.ReactNode; className?: string; as?: 'div' | 'ul' }) {
  const Tag = motion[as]
  return (
    <Tag
      initial="initial"
      whileInView="animate"
      viewport={{ once: true, margin: '-10% 0px' }}
      variants={{ initial: {}, animate: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } }}
      className={className}
    >
      {children}
    </Tag>
  )
}

export const revealItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.44, ease: EASE } },
}
