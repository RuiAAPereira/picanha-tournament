import type { ReactNode } from 'react'
import PresentationControls from './components/PresentationControls'
import { ROUTES } from './hashRoute'
import { useTournamentSession } from './useTournamentSession'

const SAVE_LABELS = { saved: 'Guardado', saving: 'A guardar…', error: 'Por guardar' } as const

/** Header, navigation, operator actions and storage feedback shared by every operator page. */
export default function OperatorLayout({ children }: { children: ReactNode }) {
  const session = useTournamentSession()
  const { state, notice, saveStatus, storageError, storageAvailable } = session
  // The parent already subscribes to hash changes; this only marks the visible section.
  const route = window.location.hash
  const activeLink = (href: string) => ({
    className: route === href ? 'is-active' : undefined,
    'aria-current': route === href ? 'page' as const : undefined,
  })

  return (
    <main aria-label="Torneio" className="operator operator-page">
      <header className="operator-header event-bar">
        <div className="operator-brand">
          <span className="brand-mark" aria-hidden="true">P</span>
          <h1>Picanha Tournament</h1>
        </div>
        <div className="tournament-context">
          <span className="context-label">Mesa de controlo</span>
          <strong>{state?.name ?? 'Preparar torneio'}</strong>
        </div>
        <nav aria-label="Secções" className="primary-navigation">
          <a href={ROUTES.home} {...activeLink(ROUTES.home)}>Início</a>
          {state && <a href={ROUTES.groups} {...activeLink(ROUTES.groups)}>Grupos</a>}
          {state && <a href={ROUTES.bracket} {...activeLink(ROUTES.bracket)}>Fase final</a>}
        </nav>
        <div className="actions operator-utilities">
          <PresentationControls />
          {state && <button className="quiet" type="button" onClick={() => void session.exportBackup()}>Exportar cópia de segurança</button>}
        </div>
      </header>

      {/* Always present, so screen readers announce what is added: save progress and info notices. */}
      <div className="status-line">
        <div role="status" aria-label="Estado de gravação">
          {state && <span className={`save-status save-status--${saveStatus}`}>{SAVE_LABELS[saveStatus]}</span>}
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
