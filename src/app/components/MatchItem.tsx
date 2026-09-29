import type { KnockoutMatch } from '../../domain/bracket'
import { isKnockoutMatch, type TournamentState } from '../../domain/tournament'
import type { TournamentMatch } from '../../domain/types'
import { resultText, sidesText } from '../labels'
import type { ResultFlow } from './useResultFlow'

type MatchItemProps = {
  state: TournamentState
  match: TournamentMatch | KnockoutMatch
  flow: ResultFlow
  caption?: string
}

/** One match: who plays, the result when there is one, and the action that fits. */
export default function MatchItem({ state, match, flow, caption }: MatchItemProps) {
  const sides = sidesText(state, match)
  const ready = !isKnockoutMatch(match) || (!!match.homePlayerId && !!match.awayPlayerId)
  return (
    <li className="match">
      {caption && <span className="caption">{caption}</span>}
      <span>{sides}</span>
      {match.result && <span className="result">{resultText(state, match, match.result)}</span>}
      {match.result
        ? <button type="button" aria-label={`Corrigir: ${sides}`} onClick={() => flow.correct(match.id)}>Corrigir</button>
        : ready && (
          <button type="button" aria-label={`Registar resultado: ${sides}`} onClick={() => flow.record(match.id)}>
            Registar resultado
          </button>
        )}
    </li>
  )
}
