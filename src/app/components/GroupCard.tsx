import { groupStandings, type TournamentGroup, type TournamentState } from '../../domain/tournament'
import { groupEntrants, playerName } from '../labels'
import MatchItem from './MatchItem'
import type { ResultFlow } from './useResultFlow'

type GroupCardProps = { state: TournamentState; group: TournamentGroup; flow: ResultFlow }

/** Standings, then pending matches in the suggested order, then completed ones. */
export default function GroupCard({ state, group, flow }: GroupCardProps) {
  const standings = groupStandings(state, group.id)
  const pending = group.matches.filter(match => !match.result)
  const played = group.matches.filter(match => match.result)
  const waiting = groupEntrants(state, group.id).slice(group.playerIds.length)
  const id = `group-${group.id}`

  return (
    <section aria-labelledby={id} className="card">
      <h3 id={id}>Grupo {group.id}</h3>
      <table>
        <caption>Classificação do Grupo {group.id}</caption>
        <thead>
          <tr><th scope="col">Pos.</th><th scope="col">Jogador</th><th scope="col">Pontos</th><th scope="col">Bolas restantes</th></tr>
        </thead>
        <tbody>
          {standings.map(row => (
            <tr key={row.playerId}>
              <td>{row.rank}.º</td>
              <th scope="row">
                {playerName(state, row.playerId)}
                {row.requiresDraw && <> <span className="tag">Empate por sortear</span></>}
              </th>
              <td>{row.points}</td>
              <td>{row.ballsLeft}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {waiting.length > 0 && (
        <>
          <p>Os jogos deste grupo são criados quando a pré-eliminatória terminar. Por apurar:</p>
          <ul>{waiting.map(label => <li key={label}>{label}</li>)}</ul>
        </>
      )}
      {pending.length > 0 && (
        <section aria-labelledby={`${id}-pending`}>
          <h4 id={`${id}-pending`}>Jogos por disputar</h4>
          <ul className="matches">{pending.map(match => <MatchItem key={match.id} state={state} match={match} flow={flow} />)}</ul>
        </section>
      )}
      {played.length > 0 && (
        <section aria-labelledby={`${id}-played`}>
          <h4 id={`${id}-played`}>Jogos concluídos</h4>
          <ul className="matches">{played.map(match => <MatchItem key={match.id} state={state} match={match} flow={flow} />)}</ul>
        </section>
      )}
    </section>
  )
}
