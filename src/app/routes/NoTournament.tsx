import { ROUTES } from '../hashRoute'
import { useTournamentSession } from '../useTournamentSession'

/** Shown by pages that need a tournament when there is none (yet). */
export default function NoTournament() {
  const { loading } = useTournamentSession()
  if (loading) return <p>A carregar o torneio guardado…</p>
  return (
    <section aria-labelledby="none-title">
      <h2 id="none-title">Sem torneio em curso</h2>
      <p><a href={ROUTES.newTournament}>Criar um novo torneio</a></p>
    </section>
  )
}
