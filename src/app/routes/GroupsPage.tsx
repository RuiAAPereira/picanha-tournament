import { useState } from 'react'
import { pendingTieScopes, type TieScope } from '../../domain/tournament'
import GroupCard from '../components/GroupCard'
import MatchItem from '../components/MatchItem'
import { useResultFlow } from '../components/useResultFlow'
import { ROUTES } from '../hashRoute'
import { preliminaryName } from '../labels'
import { useTournamentSession } from '../useTournamentSession'
import NoTournament from './NoTournament'

const tieLabel = (scope: TieScope) => scope.type === 'group'
  ? `Sortear desempate do Grupo ${scope.groupId}`
  : 'Sortear desempate dos melhores 2.ºs classificados'

export default function GroupsPage() {
  const session = useTournamentSession()
  const flow = useResultFlow()
  const [tieError, setTieError] = useState<string | null>(null)
  const { state } = session
  if (!state) return <NoTournament />

  const ties = pendingTieScopes(state)
  const pendingPreliminaries = state.preliminaryMatches.filter(match => !match.result)
  const playedPreliminaries = state.preliminaryMatches.filter(match => match.result)

  function resolve(scope: TieScope) {
    try {
      session.resolveTie(scope)
      setTieError(null)
    } catch (failure) {
      setTieError(failure instanceof Error ? failure.message : 'Não foi possível sortear o desempate.')
    }
  }

  return (
    <section aria-labelledby="groups-title">
      <h2 id="groups-title" tabIndex={-1}>Grupos</h2>
      <div aria-live="polite">
        {ties.length > 0 && (
          <div className="banner warning">
            <p>Há empates que só se resolvem por sorteio.</p>
            {ties.map(scope => (
              <button key={tieLabel(scope)} type="button" onClick={() => resolve(scope)}>{tieLabel(scope)}</button>
            ))}
          </div>
        )}
      </div>
      {tieError && <p role="alert" className="error">{tieError}</p>}

      {state.preliminaryMatches.length > 0 && (
        <section aria-labelledby="preliminaries-title">
          <h3 id="preliminaries-title">Pré-eliminatórias</h3>
          <ul className="matches">
            {[...pendingPreliminaries, ...playedPreliminaries].map(match => (
              <MatchItem key={match.id} state={state} match={match} flow={flow} caption={preliminaryName(state, match.id)} />
            ))}
          </ul>
        </section>
      )}

      <div className="groups">
        {state.groups.map(group => <GroupCard key={group.id} state={state} group={group} flow={flow} />)}
      </div>
      <p><a href={ROUTES.bracket}>Ver fase final</a></p>
      {flow.dialogs}
    </section>
  )
}
