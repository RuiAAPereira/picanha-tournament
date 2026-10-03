import type { ReactNode } from 'react'
import PresentationControls from './components/PresentationControls'
import { ROUTES } from './hashRoute'
import { useTournamentSession } from './useTournamentSession'

const SAVE_LABELS = { saved: 'Guardado', saving: 'A guardar…', error: 'Por guardar' } as const

/** Header, navigation, operator actions and storage feedback shared by every operator page. */
export default function OperatorLayout({ children }: { children: ReactNode }) {
  const session = useTournamentSession()
  const { state, notice, saveStatus, storageError, storageAvailable } = session

  return (
    <main aria-label="Torneio" className="operator operator-page">
      <header className="operator-header">
        <h1>Picanha Tournament</h1>
        <nav aria-label="Secções">
          <a href={ROUTES.home}>Início</a>
          {state && <a href={ROUTES.groups}>Grupos</a>}
          {state && <a href={ROUTES.bracket}>Fase final</a>}
        </nav>
        <div className="actions">
          <PresentationControls />
          {state && <button type="button" onClick={() => void session.exportBackup()}>Exportar cópia de segurança</button>}
        </div>
      </header>

      {/* Always present, so screen readers announce what is added: save progress and info notices. */}
      <div className="status-line">
        <div role="status">
          {state && <span className="save-status">{SAVE_LABELS[saveStatus]}</span>}
          {notice?.tone === 'info' && <span className="banner info">{notice.text}</span>}
        </div>
        {notice?.tone === 'info' && <button type="button" onClick={session.dismissNotice}>Fechar aviso</button>}
      </div>

      {saveStatus === 'error' && (
        <div role="alert" className="banner error">
          <p>{storageError} As alterações continuam nesta sessão.</p>
          <button type="button" onClick={() => void session.retrySave()}>Tentar novamente</button>
        </div>
      )}
      {saveStatus !== 'error' && !storageAvailable && storageError && (
        <p role="alert" className="banner warning">{storageError}</p>
      )}
      {notice?.tone === 'warning' && (
        <div className="banner warning" role="alert">
          <p>{notice.text}</p>
          <button type="button" onClick={session.dismissNotice}>Fechar aviso</button>
        </div>
      )}

      {children}
    </main>
  )
}
