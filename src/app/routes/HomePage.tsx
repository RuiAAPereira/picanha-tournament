import { navigate, ROUTES } from '../hashRoute'
import { useTournamentSession } from '../useTournamentSession'

export default function HomePage() {
  const session = useTournamentSession()
  const { state, loading, loadError } = session

  return (
    <section aria-labelledby="home-title">
      <h2 id="home-title">Início</h2>
      {loading && <p>A carregar o torneio guardado…</p>}
      {loadError && <p role="alert" className="error">{loadError}</p>}
      {state && <p>Torneio em curso: <strong>{state.name}</strong></p>}
      <div className="actions">
        <button type="button" className="primary" onClick={() => navigate(ROUTES.newTournament)}>Novo torneio</button>
        <button type="button" disabled={!state} onClick={() => navigate(ROUTES.groups)}>Continuar torneio</button>
        {session.canLoadDemo && (
          <button
            type="button"
            onClick={() => {
              session.loadDemo()
              navigate(ROUTES.groups)
            }}
          >
            Carregar demonstração
          </button>
        )}
      </div>
    </section>
  )
}
