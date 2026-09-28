import { createKnockoutBracket, rankRunnersUp, resolveBracket, type Bracket, type GroupOutcome } from './bracket'
import { createRoundRobinFixtures, type DrawResult, type ReadyProposal } from './formats'
import { ALL_BALLS_REMAINING, calculateStandings, recordResult } from './standings'
import { applyTieDraws, drawOrder, pendingTies } from './tiebreak'
import type { GroupStanding, MatchId, MatchResult, PlayerId, TournamentMatch } from './types'

export type TournamentPlayer = { id: PlayerId; displayName: string }

export type TieScope = { type: 'group'; groupId: string } | { type: 'runnersUp' }

export type TieDraw = { scope: TieScope; playerIds: PlayerId[] }

export type AuditEvent =
  | { type: 'tieDraw'; at: string; scope: TieScope; playerIds: PlayerId[] }
  | {
    type: 'correction'
    at: string
    matchId: MatchId
    previous: MatchResult
    next: MatchResult
    invalidatedMatchIds: MatchId[]
  }

/** Group players are the drawn players followed by the preliminary winners, so fixture ids stay stable. */
export type TournamentGroup = {
  id: string
  playerIds: PlayerId[]
  preliminaryWinnerMatchIds: MatchId[]
  matches: TournamentMatch[]
}

export type TournamentState = {
  id: string
  name: string
  createdAt: string
  players: TournamentPlayer[]
  proposal: ReadyProposal
  draw: DrawResult
  preliminaryMatches: TournamentMatch[]
  groups: TournamentGroup[]
  bracket: Bracket
  tieDraws: TieDraw[]
  auditLog: AuditEvent[]
}

export type ResultInput = {
  matchId: MatchId
  winnerId: PlayerId
  loserBallsRemaining: number
  kind?: 'played' | 'withdrawal'
  at: string
}

export type CorrectionImpact = { requiresConfirmation: boolean; invalidatedMatchIds: MatchId[] }

type StoredMatch = { id: MatchId; result?: MatchResult }

export function createTournamentState(input: {
  id: string
  name: string
  players: TournamentPlayer[]
  proposal: ReadyProposal
  draw: DrawResult
  createdAt: string
}): TournamentState {
  const { proposal, draw, players } = input
  if (
    draw.groups.length !== proposal.groupCount
    || draw.preliminaryMatches.length !== (proposal.preliminaryRound?.matchCount ?? 0)
  ) {
    throw new Error('O sorteio não corresponde ao formato proposto.')
  }
  const playerIds = new Set(players.map(player => player.id))
  if (playerIds.size !== players.length || playerIds.size !== draw.shuffledPlayerIds.length
    || draw.shuffledPlayerIds.some(id => !playerIds.has(id))) {
    throw new Error('Os jogadores não correspondem aos do sorteio.')
  }

  // Drop the optional key instead of keeping `undefined`, so the state survives a JSON round-trip.
  const { preliminaryRound, ...format } = proposal
  return derive({
    id: input.id,
    name: input.name,
    createdAt: input.createdAt,
    players,
    proposal: preliminaryRound ? { ...format, preliminaryRound } : format,
    draw,
    preliminaryMatches: draw.preliminaryMatches,
    groups: draw.groups.map(group => ({ ...group, matches: [] })),
    bracket: createKnockoutBracket(draw.groups.map(() => []), proposal.knockoutSize, proposal.qualification),
    tieDraws: [],
    auditLog: [],
  })
}

/** Group standings with stored tie draws applied. */
export function groupStandings(state: TournamentState, groupId: string): GroupStanding[] {
  const group = state.groups.find(candidate => candidate.id === groupId)
  if (!group) throw new Error('O grupo não existe.')
  return applyTieDraws(calculateStandings(group.playerIds, group.matches), drawsFor(state, { type: 'group', groupId }))
}

export function applyMatchResult(state: TournamentState, input: ResultInput): TournamentState {
  const match = locate(state, input.matchId)
  if (match.result) throw new Error('O jogo já tem resultado. Use a correção para o alterar.')
  return derive(withResults(state, new Map([[input.matchId, buildResult(match.players, input)]])))
}

/** Which already-defined matches a correction would undo. Confirmation is required when any would. */
export function correctionImpact(state: TournamentState, input: ResultInput): CorrectionImpact {
  const { invalidatedMatchIds } = planCorrection(state, input)
  return { requiresConfirmation: invalidatedMatchIds.length > 0, invalidatedMatchIds }
}

export function correctMatchResult(state: TournamentState, input: ResultInput, confirmed: boolean): TournamentState {
  const { previous, next, invalidatedMatchIds } = planCorrection(state, input)
  if (sameResult(previous, next)) return state
  if (invalidatedMatchIds.length > 0 && !confirmed) {
    throw new Error('Esta correção anula jogos já definidos da fase seguinte e requer confirmação.')
  }
  const updates = new Map<MatchId, MatchResult | null>([
    [input.matchId, next],
    ...invalidatedMatchIds.map((id): [MatchId, null] => [id, null]),
  ])
  return derive({
    ...withResults(state, updates),
    auditLog: [...state.auditLog, { type: 'correction', at: input.at, matchId: input.matchId, previous, next, invalidatedMatchIds }],
  })
}

/** Resolves every pending tie in the scope with the injected random source and records the order. */
export function resolveTieDraw(state: TournamentState, scope: TieScope, random: () => number, at: string): TournamentState {
  const ties = scope.type === 'group' ? groupTies(state, scope.groupId) : runnerUpTies(state)
  if (ties.length === 0) throw new Error('Não há empate por sortear.')
  const draws = ties.map((tie): TieDraw => ({ scope, playerIds: drawOrder(tie, random) }))
  return derive({
    ...state,
    tieDraws: [...state.tieDraws, ...draws],
    auditLog: [...state.auditLog, ...draws.map((draw): AuditEvent => ({ type: 'tieDraw', at, ...draw }))],
  })
}

function groupTies(state: TournamentState, groupId: string): PlayerId[][] {
  const standings = groupStandings(state, groupId)
  if (!outcomes(state).find(outcome => outcome.id === groupId)!.finished) {
    throw new Error('O grupo ainda não terminou.')
  }
  return pendingTies(standings)
}

function runnerUpTies(state: TournamentState): PlayerId[][] {
  const groups = outcomes(state)
  if (!groups.every(group => group.finished)) throw new Error('Os grupos ainda não terminaram.')
  return rankRunnersUp(groups, drawsFor(state, { type: 'runnersUp' }), state.bracket.qualification.bestPlacedExtras).pendingTies
}

function drawsFor(state: TournamentState, scope: TieScope): PlayerId[][] {
  return state.tieDraws
    .filter(draw => draw.scope.type === scope.type
      && (scope.type === 'runnersUp' || (draw.scope.type === 'group' && draw.scope.groupId === scope.groupId)))
    .map(draw => draw.playerIds)
}

function outcomes(state: TournamentState): GroupOutcome[] {
  return state.groups.map(group => ({
    id: group.id,
    finished: group.matches.length > 0 && group.matches.every(match => match.result),
    standings: groupStandings(state, group.id),
  }))
}

/** Recomputes everything that follows from stored results and draws: group players, fixtures and bracket. */
function derive(state: TournamentState): TournamentState {
  const groups = state.groups.map(group => placeGroup(state, group))
  const placed = { ...state, groups }
  return {
    ...placed,
    bracket: resolveBracket(state.bracket, outcomes(placed), drawsFor(placed, { type: 'runnersUp' })),
  }
}

function placeGroup(state: TournamentState, group: TournamentGroup): TournamentGroup {
  const drawn = state.draw.groups.find(candidate => candidate.id === group.id)!.playerIds
  const winners = group.preliminaryWinnerMatchIds.map(id =>
    state.preliminaryMatches.find(match => match.id === id)?.result?.winnerId)
  if (!winners.every(winner => winner)) return { ...group, playerIds: drawn, matches: [] }

  const playerIds = [...drawn, ...winners as PlayerId[]]
  // Results survive only while the fixture keeps the same players (a corrected preliminary replaces one).
  const matches = createRoundRobinFixtures(group.id, playerIds).map(fixture => {
    const previous = group.matches.find(match => match.id === fixture.id)
    return previous?.result && previous.player1Id === fixture.player1Id && previous.player2Id === fixture.player2Id
      ? { ...fixture, result: previous.result }
      : fixture
  })
  return { ...group, playerIds, matches }
}

function locate(state: TournamentState, matchId: MatchId): { players: (PlayerId | null)[]; result?: MatchResult } {
  const fixture = [...state.preliminaryMatches, ...state.groups.flatMap(group => group.matches)]
    .find(match => match.id === matchId)
  if (fixture) return { players: [fixture.player1Id, fixture.player2Id], result: fixture.result }
  const knockout = state.bracket.rounds.flatMap(round => round.matches).find(match => match.id === matchId)
  if (knockout) return { players: [knockout.homePlayerId, knockout.awayPlayerId], result: knockout.result }
  throw new Error('O jogo não existe.')
}

function buildResult(players: (PlayerId | null)[], input: ResultInput): MatchResult {
  const [player1Id, player2Id] = players
  if (!player1Id || !player2Id) throw new Error('O jogo ainda não tem os dois jogadores definidos.')
  if (input.winnerId !== player1Id && input.winnerId !== player2Id) {
    throw new Error('O vencedor tem de ser um dos jogadores do jogo.')
  }
  const kind = input.kind ?? 'played'
  const balls = input.loserBallsRemaining
  if (kind === 'played' && (!Number.isInteger(balls) || balls < 0 || balls > ALL_BALLS_REMAINING)) {
    throw new Error(`As bolas restantes têm de ser um número inteiro de 0 a ${ALL_BALLS_REMAINING}.`)
  }
  return recordResult({ id: input.matchId, player1Id, player2Id }, input.winnerId, balls, kind).result!
}

function withResults(state: TournamentState, updates: Map<MatchId, MatchResult | null>): TournamentState {
  const update = <T extends StoredMatch>(match: T): T => {
    if (!updates.has(match.id)) return match
    const { result: _previous, ...rest } = match
    const result = updates.get(match.id)
    return (result ? { ...rest, result } : rest) as T
  }
  return {
    ...state,
    preliminaryMatches: state.preliminaryMatches.map(update),
    groups: state.groups.map(group => ({ ...group, matches: group.matches.map(update) })),
    bracket: { ...state.bracket, rounds: state.bracket.rounds.map(round => ({ matches: round.matches.map(update) })) },
  }
}

const sameResult = (a: MatchResult, b: MatchResult) =>
  a.winnerId === b.winnerId && a.loserBallsRemaining === b.loserBallsRemaining && a.kind === b.kind

/**
 * Before/after slot diff. A match is invalidated when its players change and it was already played or
 * had both players; everything fed by an invalidated match follows. Listed in schedule order.
 */
function planCorrection(state: TournamentState, input: ResultInput) {
  const match = locate(state, input.matchId)
  if (!match.result) throw new Error('O jogo ainda não tem resultado. Registe o resultado em vez de o corrigir.')
  const previous = match.result
  const next = buildResult(match.players, input)
  if (sameResult(previous, next)) return { previous, next, invalidatedMatchIds: [] }

  const after = derive(withResults(state, new Map([[input.matchId, next]])))
  const invalidated: MatchId[] = []
  state.groups.forEach((group, index) => {
    for (const fixture of group.matches) {
      const updated = after.groups[index].matches.find(candidate => candidate.id === fixture.id)
      if (fixture.result && (updated?.player1Id !== fixture.player1Id || updated.player2Id !== fixture.player2Id)) {
        invalidated.push(fixture.id)
      }
    }
  })
  state.bracket.rounds.forEach((round, roundIndex) => round.matches.forEach((before, index) => {
    const updated = after.bracket.rounds[roundIndex].matches[index]
    const changed = updated.homePlayerId !== before.homePlayerId || updated.awayPlayerId !== before.awayPlayerId
    const defined = before.result || (before.homePlayerId && before.awayPlayerId)
    const downstream = [before.home, before.away]
      .some(slot => slot.type === 'winner' && invalidated.includes(slot.matchId))
    if ((changed && defined) || downstream) invalidated.push(before.id)
  }))
  return { previous, next, invalidatedMatchIds: invalidated }
}
