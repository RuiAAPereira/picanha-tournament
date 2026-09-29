/**
 * What the TV shows: plain names and labels only, never the tournament state or operator controls.
 * Built by `projectPresentation` in the operator window and sent to the presentation window as JSON.
 */
export type DrawGroupView = { id: string; entrants: string[] }

export type PreliminaryView = { label: string; sides: [string, string] }

export type DrawPayload = { groups: DrawGroupView[]; preliminaryMatches: PreliminaryView[] }

export type ResultPayload = {
  /** e.g. `Grupo A`, `Pré-eliminatória 1`, `Meias-finais`, `Final`. */
  stage: string
  winner: string
  loser: string
  loserBallsRemaining: number
  withdrawal: boolean
  corrected: boolean
}

export type ChampionPayload = { champion: string; runnerUp: string }

export type PresentationState =
  | { kind: 'idle'; tournamentName: string; payload: null }
  | { kind: 'draw'; tournamentName: string; payload: DrawPayload }
  | { kind: 'result'; tournamentName: string; payload: ResultPayload }
  | { kind: 'champion'; tournamentName: string; payload: ChampionPayload }

/** What the presentation window reads on mount: the last published state and the sound setting. */
export type PresentationSnapshot = { state: PresentationState | null; muted: boolean }
