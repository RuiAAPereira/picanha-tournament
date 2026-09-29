import { motion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

/** Children appear one after another; the whole reveal lasts roughly 2 to 5 seconds. */
const container: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.45, delayChildren: 0.2 } },
}

/** Give to each `motion.*` child that should appear in turn. */
export const revealItem: Variants = {
  hidden: { opacity: 0, y: 40, scale: 0.96 },
  shown: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: 'easeOut' } },
}

type RevealProps = {
  /** A new key starts a new reveal. */
  revealKey: number
  /** Everything shown at once: reduced motion, a skip, or a state that was not published live. */
  done: boolean
  onComplete(): void
  children: ReactNode
}

/**
 * Staged entrance for one presentation state. Content is always in the DOM; when `done` the reveal is
 * remounted without an initial state, so every child is at its final place and fully visible at once.
 */
export default function Reveal({ revealKey, done, onComplete, children }: RevealProps) {
  return (
    <motion.div
      key={`${revealKey}-${done ? 'done' : 'playing'}`}
      className="reveal"
      data-testid="reveal"
      data-reveal={done ? 'done' : 'playing'}
      variants={container}
      initial={done ? false : 'hidden'}
      animate="shown"
      onAnimationComplete={() => {
        if (!done) onComplete()
      }}
    >
      {children}
    </motion.div>
  )
}
