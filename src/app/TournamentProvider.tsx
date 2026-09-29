import { useEffect, useRef, useState, type ReactNode } from 'react'
import { drawGroups } from '../domain/formats'
import {
  applyMatchResult, correctionImpact, correctMatchResult, createTournamentState, resolveTieDraw,
  type TieScope, type TournamentState,
} from '../domain/tournament'
import {
  createTauriTournamentRepository, TOURNAMENT_SNAPSHOT_SCHEMA_VERSION,
  type TournamentRepository, type TournamentSnapshot,
} from '../platform/tournamentRepository'
import { backupFileName, tournamentIdFor } from './slugs'
import { storageErrorCode, storageErrorMessage } from './storageMessages'
import {
  TournamentSessionContext,
  type CorrectionOutcome, type Notice, type ResultEntry, type SaveStatus, type TournamentSession, type TournamentSetup,
} from './useTournamentSession'

export type Presentation = { open(): Promise<void> }

export type TournamentProviderProps = {
  repository?: TournamentRepository
  /** ISO instant; the only clock the operator flow uses. */
  now?: () => string
  /** The only random source for draws and tie draws. */
  random?: () => number
  presentation?: Presentation
  demo?: () => TournamentState
  children: ReactNode
}

export const PRESENTATION_UNAVAILABLE = 'A apresentação ainda não está disponível.'
const PRESENTATION_FAILED = 'Não foi possível abrir a apresentação. O torneio continua neste ecrã.'
const NO_TOURNAMENT = 'Não há torneio em curso.'

const unavailablePresentation: Presentation = { open: () => Promise.reject(new Error(PRESENTATION_UNAVAILABLE)) }
const isoNow = () => new Date().toISOString()

const isFinished = (state: TournamentState) => !!state.bracket.rounds.at(-1)?.matches[0]?.result

export function TournamentProvider(props: TournamentProviderProps) {
  const [fallbackRepository] = useState(() => createTauriTournamentRepository())
  const deps = useRef({ repository: fallbackRepository, now: isoNow, random: Math.random, presentation: unavailablePresentation })
  deps.current = {
    repository: props.repository ?? fallbackRepository,
    now: props.now ?? isoNow,
    random: props.random ?? Math.random,
    presentation: props.presentation ?? unavailablePresentation,
  }
  const { demo } = props

  const [state, setState] = useState<TournamentState | null>(null)
  const [setup, setSetup] = useState<TournamentSetup | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [storageError, setStorageError] = useState<string | null>(null)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [notice, setNotice] = useState<Notice | null>(null)

  // Refs hold the latest values so quick successive actions never build on a stale render.
  const stateRef = useRef<TournamentState | null>(null)
  const setupRef = useRef<TournamentSetup | null>(null)
  const queuedRef = useRef<TournamentState | null>(null)
  const savingRef = useRef(false)
  const idleRef = useRef<Promise<void>>(Promise.resolve())

  const snapshotOf = (tournament: TournamentState): TournamentSnapshot => ({
    schemaVersion: TOURNAMENT_SNAPSHOT_SCHEMA_VERSION,
    tournamentId: tournament.id,
    name: tournament.name,
    savedAt: deps.current.now(),
    status: isFinished(tournament) ? 'finished' : 'in_progress',
    state: tournament,
  })

  /** One save at a time; whatever was queued meanwhile is saved next, and only the latest state counts. */
  async function drainSaves() {
    setSaveStatus('saving')
    let failure: unknown = null
    while (queuedRef.current) {
      const next = queuedRef.current
      queuedRef.current = null
      try {
        await deps.current.repository.save(snapshotOf(next))
        failure = null
      } catch (error) {
        failure = error
      }
    }
    savingRef.current = false
    if (failure) {
      setStorageError(storageErrorMessage('save', failure))
      setSaveStatus('error')
    } else {
      setStorageError(null)
      setStorageAvailable(true)
      setSaveStatus('saved')
    }
  }

  function persist(next: TournamentState): Promise<void> {
    queuedRef.current = next
    if (!savingRef.current) {
      savingRef.current = true
      idleRef.current = drainSaves()
    }
    return idleRef.current
  }

  function commit(next: TournamentState) {
    stateRef.current = next
    setState(next)
    void persist(next)
  }

  function current(): TournamentState {
    if (!stateRef.current) throw new Error(NO_TOURNAMENT)
    return stateRef.current
  }

  async function resumeCurrent() {
    setLoading(true)
    try {
      const snapshot = await deps.current.repository.loadCurrent()
      stateRef.current = snapshot?.state ?? null
      setState(stateRef.current)
      setLoadError(null)
    } catch (error) {
      const code = storageErrorCode(error)
      if (code === 'unwritable' || code === 'busy') {
        setStorageAvailable(false)
        setStorageError(storageErrorMessage('load', error))
      } else {
        setLoadError(storageErrorMessage('load', error))
      }
    } finally {
      setLoading(false)
    }
  }

  // Load once, even when StrictMode runs effects twice.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void resumeCurrent()
  }, [])

  const withAt = (entry: ResultEntry) => ({ ...entry, at: deps.current.now() })

  const session: TournamentSession = {
    state,
    setup,
    loading,
    loadError,
    saveStatus,
    storageError,
    storageAvailable,
    notice,
    canLoadDemo: !!demo,
    createTournament(next) {
      setupRef.current = next
      setSetup(next)
    },
    confirmDraw() {
      const pending = setupRef.current
      if (!pending) throw new Error('Não há torneio por sortear.')
      const { now, random } = deps.current
      const createdAt = now()
      const draw = drawGroups(pending.players.map(player => player.id), pending.proposal, random)
      const next = createTournamentState({ ...pending, id: tournamentIdFor(pending.name, createdAt), draw, createdAt })
      setupRef.current = null
      setSetup(null)
      commit(next)
    },
    recordResult(entry) {
      commit(applyMatchResult(current(), withAt(entry)))
    },
    correctResult(entry, confirmed = false): CorrectionOutcome {
      const before = current()
      const input = withAt(entry)
      if (!confirmed) {
        const impact = correctionImpact(before, input)
        if (impact.requiresConfirmation) return { applied: false, invalidatedMatchIds: impact.invalidatedMatchIds }
      }
      const next = correctMatchResult(before, input, confirmed)
      if (next !== before) commit(next)
      return { applied: true }
    },
    resolveTie(scope: TieScope) {
      const { random, now } = deps.current
      commit(resolveTieDraw(current(), scope, random, now()))
    },
    loadDemo() {
      if (!demo) return
      setupRef.current = null
      setSetup(null)
      // A fresh id: reloading the demo must not rewrite the saved history of an earlier run.
      const loaded = demo()
      commit({ ...loaded, id: tournamentIdFor(loaded.name, deps.current.now()) })
    },
    async openPresentation() {
      try {
        await deps.current.presentation.open()
      } catch (error) {
        // A missing or closed display never stops the tournament; only the known message is shown as is.
        const unavailable = error instanceof Error && error.message === PRESENTATION_UNAVAILABLE
        if (!unavailable) console.error('[presentation]', error)
        setNotice({ tone: 'warning', text: unavailable ? PRESENTATION_UNAVAILABLE : PRESENTATION_FAILED })
      }
    },
    async exportBackup() {
      const tournament = current()
      const fileName = backupFileName(tournament.name, deps.current.now())
      // The backup copies what is stored, so let a running save finish first.
      await idleRef.current
      try {
        await deps.current.repository.exportBackup(tournament.id, fileName)
        setNotice({ tone: 'info', text: `Cópia de segurança exportada: ${fileName}` })
      } catch (error) {
        setNotice({ tone: 'warning', text: storageErrorMessage('export', error) })
      }
    },
    resumeCurrent,
    async retrySave() {
      if (stateRef.current) await persist(stateRef.current)
    },
    dismissNotice() {
      setNotice(null)
    },
  }

  return <TournamentSessionContext.Provider value={session}>{props.children}</TournamentSessionContext.Provider>
}
