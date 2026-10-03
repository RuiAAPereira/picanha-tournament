import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import type { MatchPayload } from './presentationState'

/** How long one announcement plays (its exit starts at 5.9 s in the stylesheet), and the pause before the next one. */
export const SHOW_SECONDS = 6.5
export const REST_SECONDS = 2.5

export const STYLES = ['placar', 'confronto'] as const
export type SpotlightStyle = typeof STYLES[number]

type SceneProps = { payload: MatchPayload; live: boolean }

const labelOf = (live: boolean) => (live ? 'A decorrer' : 'Próximo jogo')

const LiveChip = () => <span className="livechip"><i aria-hidden="true" />Ao vivo</span>

/** Lower-third scoreboard: two slanted plates, a "VS" badge and a moving ticker. */
function Placar({ payload, live }: SceneProps) {
  const { stage, sides: [home, away] } = payload
  const ticker = `${labelOf(live)} · ${stage} · ${home} vs ${away}`
  return (
    <div className="scene">
      <div className="a-beams" aria-hidden="true" />
      <p className="a-giant" aria-hidden="true">{stage}</p>
      <div className="a-tag">
        <span className="label">{labelOf(live)}</span>
        <span className="stagename">{stage}</span>
        {live && <LiveChip />}
      </div>
      <div className="a-plates">
        <div className="plate home"><p className="name">{home}</p></div>
        <div className="vs"><b>VS</b></div>
        <div className="plate away"><p className="name">{away}</p></div>
      </div>
      <div className="a-ticker" aria-hidden="true">
        <div className="track">{Array.from({ length: 8 }, (_, index) => <span key={index}>{ticker}</span>)}</div>
      </div>
    </div>
  )
}

/** Diagonal split screen: one colour per player, a light streak and a "VS" that lands on it. */
function Confronto({ payload, live }: SceneProps) {
  const { stage, sides: [home, away] } = payload
  return (
    <div className="scene">
      <div className="b-half b-home"><p className="name">{home}</p></div>
      <div className="b-half b-away"><p className="name">{away}</p></div>
      <div className="b-slash" aria-hidden="true"><i /></div>
      <p className="b-vs" aria-hidden="true">VS</p>
      <div className="b-top">
        <span className="stagename">{stage}</span>
        <span className="label">{labelOf(live)}</span>
        {live && <LiveChip />}
      </div>
      <div className="b-flash" aria-hidden="true" />
    </div>
  )
}

const SCENES: Record<SpotlightStyle, (props: SceneProps) => React.JSX.Element> = { placar: Placar, confronto: Confronto }

/** A random style, different from `previous` so two announcements in a row never look alike. */
const pickStyle = (previous?: SpotlightStyle): SpotlightStyle => {
  const options = STYLES.filter(style => style !== previous)
  return options[Math.floor(Math.random() * options.length)]
}

/**
 * "Próximo jogo": plays a randomly chosen style, pauses, plays another, and so on until the operator
 * starts the match. Reduced motion shows one style still.
 */
export function NextMatch({ payload }: { payload: MatchPayload }) {
  const reducedMotion = useReducedMotion() ?? false
  const [step, setStep] = useState(() => ({ round: 0, resting: false, style: pickStyle() }))

  useEffect(() => {
    if (reducedMotion) return
    const timer = setTimeout(
      () => setStep(current => current.resting
        ? { round: current.round + 1, resting: false, style: pickStyle(current.style) }
        : { ...current, resting: true }),
      (step.resting ? REST_SECONDS : SHOW_SECONDS) * 1000,
    )
    return () => clearTimeout(timer)
  }, [step, reducedMotion])

  const Scene = SCENES[step.style]
  return (
    <div className="spotlight is-loop" data-style={step.style} data-resting={step.resting}>
      {!step.resting && <Scene key={step.round} payload={payload} live={false} />}
    </div>
  )
}

/** "A decorrer": one style, played once, then held with a live marker. */
export function LiveMatch({ payload }: { payload: MatchPayload }) {
  const [style] = useState(() => pickStyle())
  const Scene = SCENES[style]
  return (
    <div className="spotlight is-live" data-style={style}>
      <Scene payload={payload} live />
    </div>
  )
}
