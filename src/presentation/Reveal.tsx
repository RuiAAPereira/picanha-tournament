import { motion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

const LEAD_SECONDS = 0.2
const ITEM_SECONDS = 0.7
/** Every reveal of two items or more lasts about this long, however many items it has. */
export const REVEAL_SECONDS = 3

/** Seconds between two items appearing, so that `items` items fill `REVEAL_SECONDS` (at most one second apart). */
export const staggerFor = (items: number) =>
  Math.min(1, (REVEAL_SECONDS - LEAD_SECONDS - ITEM_SECONDS) / Math.max(items - 1, 1))

/** Children appear one after another. */
const container = (items: number): Variants => ({
  hidden: {},
  shown: { transition: { staggerChildren: staggerFor(items), delayChildren: LEAD_SECONDS } },
})

/** Give to each `motion.*` child that should appear in turn. */
export const revealItem: Variants = {
  hidden: { opacity: 0, y: 40, scale: 0.96 },
  shown: { opacity: 1, y: 0, scale: 1, transition: { duration: ITEM_SECONDS, ease: 'easeOut' } },
}

type RevealProps = {
  /** A new key starts a new reveal. */
  revealKey: number
  /** Everything shown at once: reduced motion, a skip, or a state that was not published live. */
  done: boolean
  /** How many `revealItem` children appear in turn; sets the pace. */
  items: number
  onComplete(): void
  children: ReactNode
}

/**
 * Staged entrance for one presentation state. Content is always in the DOM; when `done` the reveal is
 * remounted without an initial state, so every child is at its final place and fully visible at once.
 */
export default function Reveal({ revealKey, done, items, onComplete, children }: RevealProps) {
  return (
    <motion.div
      key={`${revealKey}-${done ? 'done' : 'playing'}`}
      className="reveal"
      data-testid="reveal"
      data-reveal={done ? 'done' : 'playing'}
      variants={container(items)}
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
