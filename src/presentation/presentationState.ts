/**
 * What the TV shows: plain names and labels only, never the tournament state or operator controls.
 * Built by `projectPresentation` in the operator window and sent to the presentation window as JSON.
 */
/** `description` is the full wording when `name` is shortened for the TV, e.g. `Vencedor PE 3`. */
export type DrawEntrant = { name: string; description?: string }

export type DrawGroupView = { id: string; entrants: DrawEntrant[] }

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

/** One publish from the operator. Mirrors `PresentationUpdate` in src-tauri/src/presentation/store.rs. */
export type PresentationUpdate = {
  /** Increases with every publish; an older update never replaces a newer one. */
  seq: number
  /** `false` shows the state at once, without animation or sound. */
  reveal: boolean
  state: PresentationState
}

/** What a window reads first: the newest update and the sound setting. */
export type PresentationSnapshot = { update: PresentationUpdate | null; muted: boolean }
