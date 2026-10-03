import { createContext, useContext } from 'react'
import type { ReadyProposal } from '../domain/formats'
import type { MatchId } from '../domain/types'
import type { ResultInput, TieScope, TournamentPlayer, TournamentState } from '../domain/tournament'
import type { PresentationDisplay } from '../platform/presentationPort'

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
  /** The TV window is open; its private controls are shown until it closes. */
  presentationOpen: boolean
  /** Where the open TV window was put: a display id, `WINDOWED_DISPLAY`, or `null` when the app chose. */
  presentationDisplay: string | null
  presentationMuted: boolean
  createTournament(setup: TournamentSetup): void
  /** Draws the pending setup, creates the tournament and saves it. */
  confirmDraw(): void
  /** Throws the rule error, leaving the state unchanged, when the result is not valid. */
  recordResult(entry: ResultEntry): void
  /** Without `confirmed`, a correction that would undo later matches is not applied but reported. */
  correctResult(entry: ResultEntry, confirmed?: boolean): CorrectionOutcome
  resolveTie(scope: TieScope): void
  loadDemo(): void
  /** Opens the TV window on `display`, or moves it there when open; a failure only warns. Resolves whether it worked. */
  openPresentation(display?: string): Promise<boolean>
  /** Closes the TV window; `presentationOpen` turns false once it reports it is gone. */
  closePresentation(): Promise<void>
  /** The connected displays; none outside the app or when they cannot be read. */
  listPresentationDisplays(): Promise<PresentationDisplay[]>
  /** Completes the reveal running on the TV at once. */
  skipPresentation(): void
  togglePresentationMuted(): void
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
