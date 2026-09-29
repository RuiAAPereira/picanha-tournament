import { createContext, useContext } from 'react'
import type { ReadyProposal } from '../domain/formats'
import type { MatchId } from '../domain/types'
import type { ResultInput, TieScope, TournamentPlayer, TournamentState } from '../domain/tournament'

/** What the operator enters; the session stamps it with `at`. */
export type ResultEntry = Omit<ResultInput, 'at' | 'kind'> & { kind: 'played' | 'withdrawal' }

/** A tournament being set up: nothing is saved until the draw is confirmed. */
export type TournamentSetup = { name: string; players: TournamentPlayer[]; proposal: ReadyProposal }

export type CorrectionOutcome = { applied: true } | { applied: false; invalidatedMatchIds: MatchId[] }

export type SaveStatus = 'saved' | 'saving' | 'error'

export type Notice = { tone: 'info' | 'warning'; text: string }

export type TournamentSession = {
  state: TournamentState | null
  setup: TournamentSetup | null
  loading: boolean
  /** Saved data that could not be opened (corrupt, newer version…). */
  loadError: string | null
  saveStatus: SaveStatus
  /** Why saving failed or is unavailable; shown inline. */
  storageError: string | null
  storageAvailable: boolean
  notice: Notice | null
  canLoadDemo: boolean
  createTournament(setup: TournamentSetup): void
  /** Draws the pending setup, creates the tournament and saves it. */
  confirmDraw(): void
  /** Throws the rule error, leaving the state unchanged, when the result is not valid. */
  recordResult(entry: ResultEntry): void
  /** Without `confirmed`, a correction that would undo later matches is not applied but reported. */
  correctResult(entry: ResultEntry, confirmed?: boolean): CorrectionOutcome
  resolveTie(scope: TieScope): void
  loadDemo(): void
  openPresentation(): Promise<void>
  exportBackup(): Promise<void>
  resumeCurrent(): Promise<void>
  retrySave(): Promise<void>
  dismissNotice(): void
}

export const TournamentSessionContext = createContext<TournamentSession | null>(null)

export function useTournamentSession(): TournamentSession {
  const session = useContext(TournamentSessionContext)
  if (!session) throw new Error('useTournamentSession requires a TournamentProvider.')
  return session
}
