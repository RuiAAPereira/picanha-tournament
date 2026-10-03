import { useCallback, useEffect, useRef, useState } from 'react'
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

/**
 * The display most like a TV: the largest landscape one that is not the main screen, else any that is
 * not, else a window. Mirrors `preferred_secondary` in src-tauri/src/presentation/displays.rs.
 */
function preferredDisplay(displays: PresentationDisplay[]): string {
  const secondary = displays.filter(display => !display.primary)
  const area = (display: PresentationDisplay) => display.width * display.height
  const landscape = secondary
    .filter(display => display.width >= display.height)
    .reduce<PresentationDisplay | undefined>((best, display) => (!best || area(display) > area(best) ? display : best), undefined)
  return (landscape ?? secondary[0])?.id ?? WINDOWED_DISPLAY
}

/** The chosen display while it is listed (a window always is), else the preferred one. */
function selectedIn(displays: PresentationDisplay[], chosen: string | null) {
  if (chosen === WINDOWED_DISPLAY || displays.some(display => display.id === chosen)) return chosen!
  return preferredDisplay(displays)
}

/** Where the TV window goes, and the controls for it while it is open. */
export default function PresentationControls() {
  const session = useTournamentSession()
  const { listPresentationDisplays, presentationOpen, presentationDisplay } = session
  /** `null` until the first list arrives. */
  const [displays, setDisplays] = useState<PresentationDisplay[] | null>(null)
  const [chosen, setChosen] = useState(readRemembered)
  /** The button to focus once it appears, since the one clicked is replaced. */
  const [focusNext, setFocusNext] = useState<'skip' | 'present' | null>(null)
  const skipButton = useRef<HTMLButtonElement>(null)
  const presentButton = useRef<HTMLButtonElement>(null)
  const latestRequest = useRef(0)
  const selected = selectedIn(displays ?? [], chosen)

  // Screens can be plugged in or out at any time, so the list is read again whenever it matters;
  // only the newest answer counts.
  const refresh = useCallback(() => {
    const request = ++latestRequest.current
    void listPresentationDisplays().then(listed => {
      if (request === latestRequest.current) setDisplays(listed)
    })
  }, [listPresentationDisplays])
  useEffect(refresh, [refresh])

  useEffect(() => {
    const target = focusNext === 'skip' ? skipButton.current : focusNext === 'present' ? presentButton.current : null
    if (!target) return
    target.focus()
    setFocusNext(null)
  }, [focusNext, presentationOpen, presentationDisplay])

  const open = async () => {
    // Not refreshed first: a display unplugged since is reported as missing rather than swapped quietly.
    if (await session.openPresentation(selected)) {
      remember(selected)
      setFocusNext('skip')
    }
    refresh()
  }
  const close = async () => {
    await session.closePresentation()
    setFocusNext('present')
  }

  return (
    <>
      <div className="inline">
        <label htmlFor="presentation-display">Ecrã da apresentação</label>
        <select
          id="presentation-display" value={selected} onFocus={refresh}
          onChange={event => setChosen(event.target.value)}
        >
          {(displays ?? []).map(display => <option key={display.id} value={display.id}>{optionLabel(display)}</option>)}
          <option value={WINDOWED_DISPLAY}>Janela (neste ecrã)</option>
        </select>
      </div>
      {!presentationOpen && (
        // Disabled until the displays are known, so a quick click never opens a window on this screen.
        <button type="button" ref={presentButton} disabled={!displays} onClick={() => void open()}>Apresentar</button>
      )}
      {presentationOpen && (
        <>
          {selected !== presentationDisplay && (
            <button type="button" onClick={() => void open()}>Mover para este ecrã</button>
          )}
          <button type="button" ref={skipButton} onClick={session.skipPresentation}>Saltar</button>
          <button type="button" onClick={session.togglePresentationMuted}>
            {session.presentationMuted ? 'Ativar som' : 'Silenciar'}
          </button>
          {/* Last, away from where Apresentar was, so a double click never closes what it opened. */}
          <button type="button" onClick={() => void close()}>Fechar apresentação</button>
        </>
      )}
    </>
  )
}
