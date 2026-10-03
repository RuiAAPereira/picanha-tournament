import type { TournamentState } from '../domain/tournament'
import type { MatchId } from '../domain/types'

/** The confirmed change that produced a new tournament state. */
export type SessionEvent = { type: 'draw' | 'result' | 'correction' | 'tie' | 'demo'; matchId?: MatchId }

/** What the TV side tells the operator: the sound was changed (possibly on the TV), or the TV window closed. */
export type PresentationSignal = { type: 'muted'; muted: boolean } | { type: 'closed' }

/** Asks for a normal window on the operator's screen instead of a display. Mirrors `WINDOWED` in Rust. */
export const WINDOWED_DISPLAY = 'window'

/** A connected screen, as `list_presentation_displays` reports it. Sizes and positions are physical. */
export type PresentationDisplay = {
  /** The device name, e.g. `\\.\DISPLAY1`. */
  id: string
  /** "Ecrã 1": the number Windows gives the display. */
  label: string
  width: number
  height: number
  x: number
  y: number
  primary: boolean
  scaleFactor: number
}

/**
 * What the operator session needs from the TV presentation window. Any call may reject (no display,
 * window closed); the session only warns and the tournament goes on.
 */
export type PresentationPort = {
  /** On `display` (an id or `WINDOWED_DISPLAY`); without one, where the app last put it. Moves an open window. */
  open(display?: string): Promise<void>
  /** The connected displays; none outside the app. */
  listDisplays?(): Promise<PresentationDisplay[]>
  /** Closes the TV window, if open; `subscribe` then hears `closed`. */
  close?(): Promise<void>
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
