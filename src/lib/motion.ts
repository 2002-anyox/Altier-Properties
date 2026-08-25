import type { Transition, Variants } from 'framer-motion'

/** One easing curve across the whole product: fast out, settled landing. */
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const spring: Transition = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }
export const swift: Transition = { duration: 0.22, ease: EASE }
export const gentle: Transition = { duration: 0.36, ease: EASE }

/** Page-level: content rises a few pixels as it fades in. Never a slide-across. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.34, ease: EASE } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.16, ease: 'easeIn' } },
}

/** Lists and card grids: a short stagger so the eye lands on the first item. */
export const listVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } },
}

export const itemVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
}

export const popVariants: Variants = {
  initial: { opacity: 0, scale: 0.97, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2, ease: EASE } },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.12 } },
}

export const drawerVariants: Variants = {
  initial: { x: '100%' },
  animate: { x: 0, transition: { type: 'spring', stiffness: 380, damping: 40 } },
  exit: { x: '100%', transition: { duration: 0.2, ease: 'easeIn' } },
}
