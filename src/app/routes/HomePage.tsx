import { useState } from 'react'
import Modal from '../components/Modal'
import { navigate, ROUTES } from '../hashRoute'
import { championId } from '../labels'
import { useTournamentSession } from '../useTournamentSession'

type Replacement = { confirmLabel: string; run(): void }

export default function HomePage() {
  const session = useTournamentSession()
  const { state, loading, loadError } = session
  const [replacing, setReplacing] = useState<Replacement | null>(null)

  const startNew = () => navigate(ROUTES.newTournament)
  const loadDemo = () => {
    session.loadDemo()
    navigate(ROUTES.groups)
  }
  /** An unfinished tournament stays saved but stops being the current one, so ask first. */
  const replaceCurrent = (replacement: Replacement) => {
    if (state && !championId(state)) setReplacing(replacement)
    else replacement.run()
  }

  return (
    <section aria-labelledby="home-title" className="event-lobby">
      <h2 id="home-title" tabIndex={-1}>Início</h2>
      <section aria-labelledby="current-event-title" className="panel lobby-panel">
        <h3 id="current-event-title">Torneio atual</h3>
        {loading && <p>A carregar o torneio guardado…</p>}
        {loadError && <p role="alert" className="error">{loadError}</p>}
        {state && (championId(state)
          ? <p>Último torneio: <strong>{state.name}</strong> (terminado)</p>
          : <p>Torneio em curso: <strong>{state.name}</strong></p>)}
        {!loading && !state && !loadError && <p className="panel-note">Prepare as inscrições para começar um novo torneio.</p>}
        <div className="actions lobby-actions">
          <button
            type="button"
            className="primary"
            disabled={loading}
            onClick={() => replaceCurrent({ confirmLabel: 'Criar novo torneio', run: startNew })}
          >
            Novo torneio
          </button>
          <button type="button" disabled={!state} onClick={() => navigate(ROUTES.groups)}>Continuar torneio</button>
          {session.canLoadDemo && (
            <button
              type="button"
              disabled={loading}
              className="quiet"
              onClick={() => replaceCurrent({ confirmLabel: 'Carregar demonstração', run: loadDemo })}
            >
              Carregar demonstração
            </button>
          )}
        </div>
      </section>
      {replacing && state && (
        <Modal title="Substituir o torneio em curso?" onCancel={() => setReplacing(null)}>
          <p>
            O torneio <strong>{state.name}</strong> ainda não terminou. Deixa de ser o torneio em curso e, nesta versão, não pode voltar a ser aberto na aplicação (fica apenas registado na base de dados).
          </p>
          <div className="actions">
            <button type="button" onClick={() => setReplacing(null)}>Cancelar</button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                setReplacing(null)
                replacing.run()
              }}
            >
              {replacing.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
