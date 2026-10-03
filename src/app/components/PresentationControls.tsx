import { useCallback, useEffect, useState } from 'react'
import { WINDOWED_DISPLAY, type PresentationDisplay } from '../../platform/presentationPort'
import { useTournamentSession } from '../useTournamentSession'

const REMEMBERED_KEY = 'picanha.presentationDisplay'

function readRemembered(): string | null {
  try {
    return localStorage.getItem(REMEMBERED_KEY)
  } catch {
    return null
  }
}

function remember(id: string) {
  try {
    localStorage.setItem(REMEMBERED_KEY, id)
  } catch {
    // Only a convenience: the next start picks the default again.
  }
}

const optionLabel = (display: PresentationDisplay) =>
  `${display.label} — ${display.width}×${display.height}${display.primary ? ' (principal)' : ''}`

/** The chosen display while it is listed (a window always is), else the first secondary one, else a window. */
function selectedIn(displays: PresentationDisplay[], chosen: string | null) {
  if (chosen === WINDOWED_DISPLAY || displays.some(display => display.id === chosen)) return chosen!
  return displays.find(display => !display.primary)?.id ?? WINDOWED_DISPLAY
}

/** Where the TV window goes, and the controls for it while it is open. */
export default function PresentationControls() {
  const session = useTournamentSession()
  const { listPresentationDisplays, presentationOpen, presentationDisplay } = session
  const [displays, setDisplays] = useState<PresentationDisplay[]>([])
  const [chosen, setChosen] = useState(readRemembered)
  const selected = selectedIn(displays, chosen)

  // Screens can be plugged in or out at any time, so the list is read again whenever it matters.
  const refresh = useCallback(() => {
    void listPresentationDisplays().then(setDisplays)
  }, [listPresentationDisplays])
  useEffect(refresh, [refresh])

  const choose = (id: string) => {
    setChosen(id)
    remember(id)
  }
  const open = async () => {
    // Not refreshed first: a display unplugged since is reported as missing rather than swapped quietly.
    await session.openPresentation(selected)
    refresh()
  }

  return (
    <>
      <div className="inline">
        <label htmlFor="presentation-display">Ecrã da apresentação</label>
        <select
          id="presentation-display" value={selected} onFocus={refresh}
          onChange={event => choose(event.target.value)}
        >
          {displays.map(display => <option key={display.id} value={display.id}>{optionLabel(display)}</option>)}
          <option value={WINDOWED_DISPLAY}>Janela (neste ecrã)</option>
        </select>
      </div>
      {!presentationOpen && <button type="button" onClick={() => void open()}>Apresentar</button>}
      {presentationOpen && (
        <>
          {selected !== presentationDisplay && (
            <button type="button" onClick={() => void open()}>Mover para este ecrã</button>
          )}
          <button type="button" onClick={session.skipPresentation}>Saltar</button>
          <button type="button" onClick={session.togglePresentationMuted}>
            {session.presentationMuted ? 'Ativar som' : 'Silenciar'}
          </button>
          {/* Last, away from where Apresentar was, so a double click never closes what it opened. */}
          <button type="button" onClick={() => void session.closePresentation()}>Fechar apresentação</button>
        </>
      )}
    </>
  )
}
