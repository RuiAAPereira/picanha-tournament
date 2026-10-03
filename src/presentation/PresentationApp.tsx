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

/** How many items each screen reveals in turn; mirrors the `revealItem` children of each component. */
function revealItems(state: PresentationState | null): number {
  switch (state?.kind) {
    case 'draw': return 1 + state.payload.groups.length + state.payload.preliminaryMatches.length
    case 'result': return state.payload.corrected ? 6 : 5
    case 'champion': return 3
    default: return 2
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

  const [needsGesture, setNeedsGesture] = useState(false)

  useEffect(() => {
    const stop = sound.subscribe(() => setNeedsGesture(sound.needsGesture()))
    sound.prepare()
    // The webview may hold sound back until someone interacts with the TV window.
    const unlock = () => void sound.unlock()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      stop()
      sound.close()
    }
  }, [sound])
  // Silent until the stored setting is known, so a live state never chimes on a muted TV.
  useEffect(() => sound.setMuted(feed.muted || !feed.muteKnown), [sound, feed.muted, feed.muteKnown])
  useEffect(() => {
    if (feed.revealKey > 0) void sound.play()
  }, [sound, feed.revealKey])

  const showsTournament = feed.state && feed.state.kind !== 'idle'
  return (
    <main aria-label="Apresentação" className="presentation">
      {showsTournament && <p className="tournament-name">{feed.state!.tournamentName}</p>}
      <Reveal
        revealKey={feed.revealKey}
        done={reducedMotion || feed.reveal === 'done'}
        items={revealItems(feed.state)}
        onComplete={feed.completeReveal}
      >
        <Content state={feed.state} />
      </Reveal>
      <div className="sound">
        {needsGesture && !feed.muted && <p className="sound-hint">Clique no ecrã para ativar o som</p>}
        <button type="button" className="mute" onClick={() => feed.setMuted(!feed.muted)}>
          {feed.muted ? 'Ativar som' : 'Silenciar'}
        </button>
      </div>
    </main>
  )
}
