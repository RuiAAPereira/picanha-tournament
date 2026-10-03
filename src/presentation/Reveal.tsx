import { motion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

const LEAD_SECONDS = 0.2
const ITEM_SECONDS = 0.7
/** Every reveal lasts this long, however many items it has. */
export const REVEAL_SECONDS = 3

/**
 * When the first item starts and how far apart the next ones follow, so the last one settles at
 * `REVEAL_SECONDS`. A lone item waits longer before it appears.
 */
export function revealTiming(items: number) {
  const gaps = Math.max(items, 1) - 1
  const stagger = gaps === 0 ? 0 : (REVEAL_SECONDS - LEAD_SECONDS - ITEM_SECONDS) / gaps
  const lead = REVEAL_SECONDS - ITEM_SECONDS - stagger * gaps
  return { lead, stagger, total: lead + stagger * gaps + ITEM_SECONDS }
}

/** Children appear one after another. */
const container = (items: number): Variants => {
  const { lead, stagger } = revealTiming(items)
  return { hidden: {}, shown: { transition: { staggerChildren: stagger, delayChildren: lead } } }
}

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
