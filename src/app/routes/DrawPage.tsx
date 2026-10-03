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
      <section aria-labelledby="draw-title" className="draw-workflow">
        <h2 id="draw-title" tabIndex={-1}>Sorteio</h2>
        <section aria-labelledby="draw-briefing-title" className="panel draw-briefing">
          <h3 id="draw-briefing-title">Preparar sorteio</h3>
          <p><strong>{setup.name}</strong> — {setup.players.length} jogadores</p>
          <p>{setup.proposal.reason}</p>
          <p className="panel-note">O sorteio é feito uma única vez e fica guardado. Pode abrir a apresentação antes de sortear.</p>
          {error && <p role="alert" className="error">{error}</p>}
          <div className="actions workflow-actions">
            <a href={ROUTES.newTournament} className="button quiet">Voltar</a>
            <button type="button" className="primary" disabled={session.loading} onClick={draw}>Sortear</button>
          </div>
        </section>
      </section>
    )
  }

  if (!state) return <NoTournament />

  return (
    <section aria-labelledby="draw-title" className="draw-workflow">
      <h2 id="draw-title" tabIndex={-1}>Sorteio</h2>
      <p className="draw-summary"><strong>{state.name}</strong> — {state.proposal.reason}</p>
      {state.preliminaryMatches.length > 0 && (
        <section aria-labelledby="draw-preliminary" className="panel preliminary-roster">
          <h3 id="draw-preliminary">Pré-eliminatórias</h3>
          <ul>
            {state.preliminaryMatches.map(match => (
              <li key={match.id}>{preliminaryName(state, match.id)}: {sidesText(state, match)}</li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="draw-rosters-title" className="draw-rosters">
        <h3 id="draw-rosters-title">Grupos sorteados</h3>
        <div className="groups roster-grid">
          {state.draw.groups.map(group => (
            <section key={group.id} aria-labelledby={`draw-group-${group.id}`} className="panel roster-panel">
              <h3 id={`draw-group-${group.id}`}>Grupo {group.id}</h3>
              <ul className="draw-player-list">{groupEntrants(state, group.id).map(entrant => <li key={entrant}>{entrant}</li>)}</ul>
            </section>
          ))}
        </div>
      </section>
      <div className="actions workflow-actions"><a href={ROUTES.groups} className="button primary">Continuar para os grupos</a></div>
    </section>
  )
}
