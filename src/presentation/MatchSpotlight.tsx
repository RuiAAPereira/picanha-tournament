import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { MatchPayload } from './presentationState'

/** How long one announcement plays, and the pause before the next one starts. */
export const TEMPLATE_SECONDS = 6.5
export const REST_SECONDS = 2.5

const EASE = [0.22, 1, 0.36, 1] as const

type TemplateProps = { payload: MatchPayload }

const Stage = ({ children }: { children: string }) => <p className="eyebrow">{children}</p>

/** Names slide in from both edges and meet at a "VS" badge. */
function SlideTemplate({ payload }: TemplateProps) {
  const [home, away] = payload.sides
  return (
    <motion.div className="spot spot-slide" initial="hidden" animate="shown" exit="gone">
      <motion.p className="spot-kicker" variants={fade}>Próximo jogo</motion.p>
      <Stage>{payload.stage}</Stage>
      <div className="spot-row">
        <motion.p className="spot-name" variants={fromSide(-1)}>{home}</motion.p>
        <motion.span className="spot-vs" variants={pop}>VS</motion.span>
        <motion.p className="spot-name" variants={fromSide(1)}>{away}</motion.p>
      </div>
    </motion.div>
  )
}

/** Two panels wipe open from the centre line, one per player. */
function SplitTemplate({ payload }: TemplateProps) {
  const [home, away] = payload.sides
  return (
    <motion.div className="spot spot-split" initial="hidden" animate="shown" exit="gone">
      <motion.p className="spot-kicker" variants={fade}>Próximo jogo</motion.p>
      <Stage>{payload.stage}</Stage>
      <div className="spot-panels">
        <motion.div className="spot-panel" variants={wipe('right')}><p className="spot-name">{home}</p></motion.div>
        <motion.span className="spot-vs spot-vs-float" variants={pop}>VS</motion.span>
        <motion.div className="spot-panel" variants={wipe('left')}><p className="spot-name">{away}</p></motion.div>
      </div>
    </motion.div>
  )
}

/** Names rise one over the other, with a line sweeping between them. */
function StackTemplate({ payload }: TemplateProps) {
  const [home, away] = payload.sides
  return (
    <motion.div className="spot spot-stack" initial="hidden" animate="shown" exit="gone">
      <motion.p className="spot-kicker" variants={fade}>Próximo jogo</motion.p>
      <Stage>{payload.stage}</Stage>
      <motion.p className="spot-name" variants={rise}>{home}</motion.p>
      <motion.div className="spot-line" variants={sweep} />
      <motion.p className="spot-versus" variants={fade}>contra</motion.p>
      <motion.p className="spot-name" variants={rise}>{away}</motion.p>
    </motion.div>
  )
}

const TEMPLATES = [SlideTemplate, SplitTemplate, StackTemplate]

const fade: Variants = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
  gone: { opacity: 0, transition: { duration: 0.4 } },
}
const fromSide = (direction: 1 | -1): Variants => ({
  hidden: { opacity: 0, x: direction * 220 },
  shown: { opacity: 1, x: 0, transition: { duration: 0.8, ease: EASE } },
  gone: { opacity: 0, x: direction * -220, transition: { duration: 0.5, ease: 'easeIn' } },
})
const pop: Variants = {
  hidden: { opacity: 0, scale: 0.2, rotate: -12 },
  shown: { opacity: 1, scale: 1, rotate: 0, transition: { type: 'spring', stiffness: 260, damping: 14, delay: 0.5 } },
  gone: { opacity: 0, scale: 2, transition: { duration: 0.4 } },
}
const wipe = (from: 'left' | 'right'): Variants => ({
  hidden: { clipPath: from === 'right' ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)', opacity: 0 },
  shown: { clipPath: 'inset(0 0 0 0)', opacity: 1, transition: { duration: 0.9, ease: EASE } },
  gone: { opacity: 0, transition: { duration: 0.4 } },
})
const rise: Variants = {
  hidden: { opacity: 0, y: 80 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
  gone: { opacity: 0, y: -60, transition: { duration: 0.4 } },
}
const sweep: Variants = {
  hidden: { scaleX: 0, opacity: 0 },
  shown: { scaleX: 1, opacity: 1, transition: { duration: 0.9, ease: EASE, delay: 0.3 } },
  gone: { opacity: 0, transition: { duration: 0.3 } },
}

/**
 * "Próximo jogo": plays one template after another with a pause in between, forever, until the
 * operator starts the match. Reduced motion shows the first template still.
 */
export function NextMatch({ payload }: { payload: MatchPayload }) {
  const reducedMotion = useReducedMotion() ?? false
  const [step, setStep] = useState({ index: 0, resting: false })

  useEffect(() => {
    if (reducedMotion) return
    const timer = setTimeout(
      () => setStep(({ index, resting }) => resting ? { index: (index + 1) % TEMPLATES.length, resting: false } : { index, resting: true }),
      (step.resting ? REST_SECONDS : TEMPLATE_SECONDS) * 1000,
    )
    return () => clearTimeout(timer)
  }, [step, reducedMotion])

  const Template = TEMPLATES[step.index]
  return (
    <div className="spotlight" data-template={step.index} data-resting={step.resting}>
      <AnimatePresence mode="wait">
        {!step.resting && <Template key={step.index} payload={payload} />}
      </AnimatePresence>
    </div>
  )
}

/** "A decorrer": a steady scoreboard with a pulsing live marker. */
export function LiveMatch({ payload }: { payload: MatchPayload }) {
  const [home, away] = payload.sides
  return (
    <div className="spotlight spot-live">
      <p className="live-marker"><span className="live-dot" aria-hidden="true" />A decorrer</p>
      <Stage>{payload.stage}</Stage>
      <motion.div className="spot-row" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: EASE }}>
        <p className="spot-name">{home}</p>
        <span className="spot-vs">VS</span>
        <p className="spot-name">{away}</p>
      </motion.div>
    </div>
  )
}
