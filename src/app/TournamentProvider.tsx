import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { drawGroups } from '../domain/formats'
import {
  applyMatchResult, correctionImpact, correctMatchResult, createTournamentState, resolveTieDraw,
  type TieScope, type TournamentState,
} from '../domain/tournament'
import { createTauriPresentationController } from '../platform/presentation'
import type { PresentationPort, SessionEvent } from '../platform/presentationPort'
import { createTauriTournamentRepository, type TournamentRepository } from '../platform/tournamentRepository'
import { backupFileName, claimUniqueId, tournamentIdFor } from './slugs'
import { storageErrorCode, storageErrorMessage } from './storageMessages'
import { useAutosave } from './useAutosave'
import {
  TournamentSessionContext,
  type CorrectionOutcome, type Notice, type ResultEntry, type TournamentSession, type TournamentSetup,
} from './useTournamentSession'

export type TournamentProviderProps = {
  repository?: TournamentRepository
  /** ISO instant; the only clock the operator flow uses. */
  now?: () => string
  /** The only random source for draws and tie draws. */
  random?: () => number
  presentation?: PresentationPort
  demo?: () => TournamentState
  children: ReactNode
}

export const PRESENTATION_UNAVAILABLE = 'A apresentação ainda não está disponível.'
const PRESENTATION_FAILED = 'Não foi possível abrir a apresentação. O torneio continua neste ecrã.'
const PRESENTATION_OUT_OF_DATE = 'A apresentação não recebeu a última atualização. O torneio continua.'
const NO_TOURNAMENT = 'Não há torneio em curso.'

const unavailablePresentation: PresentationPort = { open: () => Promise.reject(new Error(PRESENTATION_UNAVAILABLE)) }
const isoNow = () => new Date().toISOString()
/** The real TV window under Tauri; the unavailable stub in a plain browser. */
const defaultPresentation = (): PresentationPort =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? createTauriPresentationController() : unavailablePresentation

type Deps = {
  repository: TournamentRepository
  now: () => string
  random: () => number
  presentation: PresentationPort
  demo?: () => TournamentState
}

export function TournamentProvider(props: TournamentProviderProps) {
  const [fallbackRepository] = useState(() => createTauriTournamentRepository())
  const [fallbackPresentation] = useState(defaultPresentation)
  // Written during render on purpose: the stable actions below always read the latest injected
  // dependencies without being recreated (and without changing the context value).
  const deps = useRef<Deps>(null!)
  deps.current = {
    repository: props.repository ?? fallbackRepository,
    now: props.now ?? isoNow,
    random: props.random ?? Math.random,
    presentation: props.presentation ?? fallbackPresentation,
    demo: props.demo,
  }

  const autosave = useAutosave(deps)
  const [state, setState] = useState<TournamentState | null>(null)
  const [setup, setSetup] = useState<TournamentSetup | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [presentationOpen, setPresentationOpen] = useState(false)
  const [presentationMuted, setPresentationMuted] = useState(false)

  // Created once: `actions` may only call autosave's stable methods, never read its state fields,
  // which would stay frozen at their first-render values here.
  const [actions] = useState(() => {
    // Latest values, so quick successive actions never build on a stale render.
    let current: TournamentState | null = null
    let pendingSetup: TournamentSetup | null = null
    /** Bumped by every confirmed change; a slower startup load must not overwrite them. */
    let commits = 0
    /** Stored ids plus every id handed out in this session. */
    const takenIds = new Set<string>()
    /** Set by the first successful open: before that, a TV that cannot take updates is not news. */
    let presentationOpened = false
    let muted = false

    const requireState = () => {
      if (!current) throw new Error(NO_TOURNAMENT)
      return current
    }
    const withAt = (entry: ResultEntry) => ({ ...entry, at: deps.current.now() })
    const newId = (name: string, at: string) => claimUniqueId(tournamentIdFor(name, at), takenIds)
    const warnPresentation = (error: unknown) => {
      if (!presentationOpened) return
      console.error('[presentation]', error)
      setNotice({ tone: 'warning', text: PRESENTATION_OUT_OF_DATE })
    }
    /** Runs an optional TV call; a failure only warns. */
    function tellPresentation(send: ((presentation: PresentationPort) => Promise<void> | undefined)) {
      try {
        send(deps.current.presentation)?.catch(warnPresentation)
      } catch (error) {
        warnPresentation(error)
      }
    }

    function clearSetup() {
      pendingSetup = null
      setSetup(null)
    }

    function commit(next: TournamentState, event: SessionEvent) {
      commits++
      current = next
      takenIds.add(next.id)
      setState(next)
      void autosave.persist(next)
      // Published even before the TV opens: the app keeps the latest state for the window to read.
      tellPresentation(presentation => presentation.publish?.(next, event))
    }

    async function resumeCurrent() {
      const commitsAtStart = commits
      setLoading(true)
      const { repository } = deps.current
      // Never awaited: a slow listing only reserves ids whenever it arrives and must not hold up startup.
      void repository.list()
        .then(summaries => summaries.forEach(summary => takenIds.add(summary.tournamentId)))
        .catch(() => {})
      try {
        const snapshot = await repository.loadCurrent()
        if (snapshot) takenIds.add(snapshot.tournamentId)
        if (commits === commitsAtStart) {
          current = snapshot?.state ?? null
          setState(current)
        }
        setLoadError(null)
      } catch (error) {
        const code = storageErrorCode(error)
        if (code === 'unwritable' || code === 'busy') autosave.markUnavailable(storageErrorMessage('load', error))
        else setLoadError(storageErrorMessage('load', error))
      } finally {
        setLoading(false)
      }
    }

    return {
      createTournament(next: TournamentSetup) {
        pendingSetup = next
        setSetup(next)
      },
      confirmDraw() {
        if (!pendingSetup) throw new Error('Não há torneio por sortear.')
        const { now, random } = deps.current
        const createdAt = now()
        const draw = drawGroups(pendingSetup.players.map(player => player.id), pendingSetup.proposal, random)
        const next = createTournamentState({ ...pendingSetup, id: newId(pendingSetup.name, createdAt), draw, createdAt })
        clearSetup()
        commit(next, { type: 'draw' })
      },
      recordResult(entry: ResultEntry) {
        commit(applyMatchResult(requireState(), withAt(entry)), { type: 'result', matchId: entry.matchId })
      },
      correctResult(entry: ResultEntry, confirmed = false): CorrectionOutcome {
        const before = requireState()
        const input = withAt(entry)
        if (!confirmed) {
          const impact = correctionImpact(before, input)
          if (impact.requiresConfirmation) return { applied: false, invalidatedMatchIds: impact.invalidatedMatchIds }
        }
        const next = correctMatchResult(before, input, confirmed)
        if (next !== before) commit(next, { type: 'correction', matchId: entry.matchId })
        return { applied: true }
      },
      resolveTie(scope: TieScope) {
        const { random, now } = deps.current
        commit(resolveTieDraw(requireState(), scope, random, now()), { type: 'tie' })
      },
      loadDemo() {
        const { demo } = deps.current
        if (!demo) return
        clearSetup()
        // A fresh id: reloading the demo must not rewrite the saved history of an earlier run.
        const loaded = demo()
        commit({ ...loaded, id: newId(loaded.name, deps.current.now()) }, { type: 'demo' })
      },
      async openPresentation() {
        try {
          await deps.current.presentation.open()
          presentationOpened = true
          setPresentationOpen(true)
        } catch (error) {
          // A missing or closed display never stops the tournament; only the known message is shown as is.
          const unavailable = error instanceof Error && error.message === PRESENTATION_UNAVAILABLE
          if (!unavailable) console.error('[presentation]', error)
          setNotice({ tone: 'warning', text: unavailable ? PRESENTATION_UNAVAILABLE : PRESENTATION_FAILED })
        }
      },
      skipPresentation() {
        tellPresentation(presentation => presentation.skip?.())
      },
      togglePresentationMuted() {
        muted = !muted
        setPresentationMuted(muted)
        tellPresentation(presentation => presentation.setMuted?.(muted))
      },
      async exportBackup() {
        // The backup copies what is stored: let a running save finish and retry a failed one first.
        await autosave.whenIdle()
        if (autosave.lastSaveFailed() && current) await autosave.persist(current)
        const tournament = requireState()
        const fileName = backupFileName(tournament.name, deps.current.now())
        const stale = autosave.lastSaveFailed()
        try {
          await deps.current.repository.exportBackup(tournament.id, fileName)
          setNotice(stale
            ? { tone: 'warning', text: `Cópia de segurança exportada (${fileName}), mas não inclui as últimas alterações, que ainda não foram guardadas.` }
            : { tone: 'info', text: `Cópia de segurança exportada: ${fileName}` })
        } catch (error) {
          setNotice({ tone: 'warning', text: storageErrorMessage('export', error) })
        }
      },
      resumeCurrent,
      async retrySave() {
        if (current) await autosave.persist(current)
      },
      dismissNotice() {
        setNotice(null)
      },
    }
  })

  // Load once, even when StrictMode runs effects twice.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void actions.resumeCurrent()
  }, [actions])

  const { saveStatus, storageError, storageAvailable } = autosave
  const canLoadDemo = !!props.demo
  const session = useMemo((): TournamentSession => ({
    state, setup, loading, loadError, saveStatus, storageError, storageAvailable, notice, canLoadDemo,
    presentationOpen, presentationMuted, ...actions,
  }), [
    state, setup, loading, loadError, saveStatus, storageError, storageAvailable, notice, canLoadDemo,
    presentationOpen, presentationMuted, actions,
  ])

  return <TournamentSessionContext.Provider value={session}>{props.children}</TournamentSessionContext.Provider>
}
