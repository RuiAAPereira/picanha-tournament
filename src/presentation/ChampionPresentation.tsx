import { motion } from 'framer-motion'
import type { ChampionPayload } from './presentationState'
import { revealItem } from './Reveal'

/** The final is decided: the champion, then the runner-up. */
export default function ChampionPresentation({ payload }: { payload: ChampionPayload }) {
  return (
    <div className="champion">
      <motion.p className="eyebrow" variants={revealItem}>Campeão</motion.p>
      <motion.h1 className="headline" variants={revealItem}>{payload.champion}</motion.h1>
      <motion.p className="opponent" variants={revealItem}>{`Finalista: ${payload.runnerUp}`}</motion.p>
    </div>
  )
}
