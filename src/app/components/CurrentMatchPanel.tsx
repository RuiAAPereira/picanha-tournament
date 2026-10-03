import { currentMatch, findMatch } from '../../domain/tournament'
import { championId, matchStage, sidesText } from '../labels'
import { useTournamentSession } from '../useTournamentSession'
import { useResultFlow } from './useResultFlow'

/** The match in the spotlight: start it, then enter its result, and the next one follows by itself. */
export default function CurrentMatchPanel() {
  const session = useTournamentSession()
  const flow = useResultFlow()
  const { state } = session
  if (!state || championId(state)) return null

  const current = currentMatch(state)
  const match = current && findMatch(state, current.matchId)
  if (!current || !match) return null
  const live = current.status === 'live'
  const sides = sidesText(state, match)

  return (
    <section aria-labelledby="current-match-title" className={`panel current-match${live ? ' is-live' : ''}`}>
      <h3 id="current-match-title">{live ? 'A decorrer' : 'Próximo jogo'}</h3>
      <p className="current-match-sides"><span className="caption">{matchStage(state, match)}</span> <strong>{sides}</strong></p>
      <div className="actions">
        {live
          ? (
            <>
              <button type="button" className="quiet" onClick={session.cancelMatch}>Voltar a próximo jogo</button>
              <button type="button" className="primary" onClick={() => flow.record(match.id)}>
                Terminar e registar resultado
              </button>
            </>
          )
          : <button type="button" className="primary" onClick={session.startMatch}>Iniciar jogo</button>}
      </div>
      {flow.dialogs}
    </section>
  )
}
