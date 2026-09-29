import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import ChampionPresentation from './ChampionPresentation'
import DrawPresentation from './DrawPresentation'
import './presentation.css'
import type { PresentationState } from './presentationState'
import ResultPresentation from './ResultPresentation'
import Reveal, { revealItem } from './Reveal'
import { createRevealSound } from './sound'
import { usePresentationState } from './usePresentationState'

const APP_NAME = 'Picanha Tournament'

function Idle({ tournamentName }: { tournamentName: string | null }) {
  return (
    <div className="idle">
      <motion.h1 className="headline" variants={revealItem}>{tournamentName ?? APP_NAME}</motion.h1>
      <motion.p className="eyebrow" variants={revealItem}>{tournamentName ? APP_NAME : 'A aguardar o torneio'}</motion.p>
    </div>
  )
}

function Content({ state }: { state: PresentationState | null }) {
  switch (state?.kind) {
    case 'draw': return <DrawPresentation payload={state.payload} />
    case 'result': return <ResultPresentation payload={state.payload} />
    case 'champion': return <ChampionPresentation payload={state.payload} />
    default: return <Idle tournamentName={state?.tournamentName ?? null} />
  }
}

/**
 * The TV window: read-only, with a single mute button. `initialState` renders a fixed state (tests,
 * previews); otherwise the state comes from the operator window through Tauri events.
 */
export default function PresentationApp({ initialState }: { initialState?: PresentationState }) {
  const feed = usePresentationState(initialState)
  const reducedMotion = useReducedMotion() ?? false
  const [sound] = useState(createRevealSound)

  useEffect(() => () => sound.close(), [sound])
  useEffect(() => sound.setMuted(feed.muted), [sound, feed.muted])
  useEffect(() => {
    if (feed.revealKey > 0) sound.play()
  }, [sound, feed.revealKey])

  const showsTournament = feed.state && feed.state.kind !== 'idle'
  return (
    <main aria-label="Apresentação" className="presentation">
      {showsTournament && <p className="tournament-name">{feed.state!.tournamentName}</p>}
      <Reveal revealKey={feed.revealKey} done={reducedMotion || feed.reveal === 'done'} onComplete={feed.completeReveal}>
        <Content state={feed.state} />
      </Reveal>
      <button type="button" className="mute" onClick={() => feed.setMuted(!feed.muted)}>
        {feed.muted ? 'Ativar som' : 'Silenciar'}
      </button>
    </main>
  )
}
