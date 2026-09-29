import { useState } from 'react'
import { ROUTES } from '../hashRoute'
import { groupEntrants, preliminaryName, sidesText } from '../labels'
import { useTournamentSession } from '../useTournamentSession'
import NoTournament from './NoTournament'

/** Before the draw: what will be drawn. After it: the groups and preliminary matches, saved. */
export default function DrawPage() {
  const session = useTournamentSession()
  const { setup, state } = session
  const [error, setError] = useState<string | null>(null)

  if (setup) {
    const draw = () => {
      try {
        session.confirmDraw()
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Não foi possível fazer o sorteio.')
      }
    }
    return (
      <section aria-labelledby="draw-title">
        <h2 id="draw-title">Sorteio</h2>
        <p><strong>{setup.name}</strong> — {setup.players.length} jogadores</p>
        <p>{setup.proposal.reason}</p>
        <p>O sorteio é feito uma única vez e fica guardado. Pode abrir a apresentação antes de sortear.</p>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="actions">
          <a href={ROUTES.newTournament}>Voltar</a>
          <button type="button" className="primary" disabled={session.loading} onClick={draw}>Sortear</button>
        </div>
      </section>
    )
  }

  if (!state) return <NoTournament />

  return (
    <section aria-labelledby="draw-title">
      <h2 id="draw-title">Sorteio</h2>
      <p><strong>{state.name}</strong> — {state.proposal.reason}</p>
      {state.preliminaryMatches.length > 0 && (
        <section aria-labelledby="draw-preliminary">
          <h3 id="draw-preliminary">Pré-eliminatórias</h3>
          <ul>
            {state.preliminaryMatches.map(match => (
              <li key={match.id}>{preliminaryName(state, match.id)}: {sidesText(state, match)}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="groups">
        {state.draw.groups.map(group => (
          <section key={group.id} aria-labelledby={`draw-group-${group.id}`} className="card">
            <h3 id={`draw-group-${group.id}`}>Grupo {group.id}</h3>
            <ul>{groupEntrants(state, group.id).map(entrant => <li key={entrant}>{entrant}</li>)}</ul>
          </section>
        ))}
      </div>
      <p><a href={ROUTES.groups} className="button primary">Continuar para os grupos</a></p>
    </section>
  )
}
