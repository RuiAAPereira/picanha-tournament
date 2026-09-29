import type { TournamentState } from '../domain/tournament'
import type { MatchId } from '../domain/types'

/** The confirmed change that produced a new tournament state. */
export type SessionEvent = { type: 'draw' | 'result' | 'correction' | 'tie' | 'demo'; matchId?: MatchId }

/**
 * What the operator session needs from the TV presentation window. Any call may reject (no display,
 * window closed); the session only warns and the tournament goes on.
 */
export type PresentationPort = {
  open(): Promise<void>
  /** Called after every confirmed change, without being awaited. */
  publish?(state: TournamentState, event: SessionEvent): Promise<void>
  /** Completes the running reveal on the TV at once. */
  skip?(): Promise<void>
  setMuted?(muted: boolean): Promise<void>
}
