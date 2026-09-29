import MatchItem from '../components/MatchItem'
import { useResultFlow } from '../components/useResultFlow'
import { ROUTES } from '../hashRoute'
import { playerName, roundName } from '../labels'
import { useTournamentSession } from '../useTournamentSession'
import NoTournament from './NoTournament'

/** Rounds side by side; results can be entered once both players of a match are known. */
export default function BracketPage() {
  const { state } = useTournamentSession()
  const flow = useResultFlow()
  if (!state) return <NoTournament />

  const { rounds } = state.bracket
  const champion = rounds.at(-1)?.matches[0]?.result?.winnerId

  return (
    <section aria-labelledby="bracket-title">
      <h2 id="bracket-title">Fase final</h2>
      {champion && <p className="champion">Campeão: {playerName(state, champion)}</p>}
      <div className="bracket">
        {rounds.map((round, index) => {
          const name = roundName(state, index + 1)
          const id = `round-${index + 1}`
          return (
            <section key={id} aria-labelledby={id} className="card">
              <h3 id={id}>{name}</h3>
              <ul className="matches">
                {round.matches.map((match, position) => (
                  <MatchItem
                    key={match.id}
                    state={state}
                    match={match}
                    flow={flow}
                    caption={round.matches.length > 1 ? `Jogo ${position + 1}` : undefined}
                  />
                ))}
              </ul>
            </section>
          )
        })}
      </div>
      <p><a href={ROUTES.groups}>Ver grupos</a></p>
      {flow.dialogs}
    </section>
  )
}
