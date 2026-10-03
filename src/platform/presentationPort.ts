import type { TournamentState } from '../domain/tournament'
import type { MatchId } from '../domain/types'

/** The confirmed change that produced a new tournament state. */
export type SessionEvent = { type: 'draw' | 'result' | 'correction' | 'tie' | 'demo'; matchId?: MatchId }

/** What the TV side tells the operator: the sound was changed (possibly on the TV), or the TV window closed. */
export type PresentationSignal = { type: 'muted'; muted: boolean } | { type: 'closed' }

/**
 * What the operator session needs from the TV presentation window. Any call may reject (no display,
 * window closed); the session only warns and the tournament goes on.
 */
export type PresentationPort = {
  open(): Promise<void>
  /** Called after every confirmed change, without being awaited. */
  publish?(state: TournamentState, event: SessionEvent): Promise<void>
  /** Stores what the TV should show for a resumed tournament, without animation or sound. */
  seed?(state: TournamentState): Promise<void>
  /** Completes the running reveal on the TV at once. */
  skip?(): Promise<void>
  setMuted?(muted: boolean): Promise<void>
  /** The stored sound setting. */
  readMuted?(): Promise<boolean>
  /** Returns the unsubscribe function. */
  subscribe?(listener: (signal: PresentationSignal) => void): () => void
}
