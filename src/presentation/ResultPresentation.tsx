import { motion } from 'framer-motion'
import type { ResultPayload } from './presentationState'
import { revealItem } from './Reveal'

const ballsText = (balls: number) => `${balls} ${balls === 1 ? 'bola' : 'bolas'}`

/** One confirmed result: where it was played, who won, and how (balls left or withdrawal). */
export default function ResultPresentation({ payload }: { payload: ResultPayload }) {
  const { stage, winner, loser, loserBallsRemaining, withdrawal, corrected } = payload
  return (
    <div className="result">
      <motion.p className="eyebrow" variants={revealItem}>{stage}</motion.p>
      {corrected && <motion.p className="badge" variants={revealItem}>Resultado corrigido</motion.p>}
      <motion.h1 className="headline" variants={revealItem}>{winner}</motion.h1>
      <motion.p className="verb" variants={revealItem}>venceu</motion.p>
      <motion.p className="opponent" variants={revealItem}>{loser}</motion.p>
      <motion.p className="detail" variants={revealItem}>
        {withdrawal
          ? <strong>Desistência</strong>
          : <>{loserBallsRemaining === 1 ? 'Ficou' : 'Ficaram'} <strong>{ballsText(loserBallsRemaining)}</strong> na mesa</>}
      </motion.p>
    </div>
  )
}
