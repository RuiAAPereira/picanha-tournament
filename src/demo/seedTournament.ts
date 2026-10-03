import { drawGroups, proposeFormats, type ReadyProposal } from '../domain/formats'
import { applyMatchResult, createTournamentState, type TournamentState } from '../domain/tournament'
import type { MatchId, PlayerId } from '../domain/types'
import { projectPresentation } from '../presentation/projection'
import type { PresentationState } from '../presentation/presentationState'

const NAME = 'Torneio de demonstração'
const CREATED_AT = '2026-09-26T20:00:00.000Z'

/** Fictional first names only. */
const PLAYERS = [
  ['rui', 'Rui'], ['ana', 'Ana'], ['bruno', 'Bruno'], ['carla', 'Carla'],
  ['duarte', 'Duarte'], ['ines', 'Inês'], ['joana', 'Joana'], ['luis', 'Luís'],
  ['marta', 'Marta'], ['nuno', 'Nuno'], ['rita', 'Rita'], ['sofia', 'Sofia'],
  ['tiago', 'Tiago'], ['vasco', 'Vasco'], ['beatriz', 'Beatriz'], ['goncalo', 'Gonçalo'],
].map(([id, displayName]) => ({ id, displayName }))

/**
 * Balls left by the loser in each group's six fixtures, in fixture order. In every group the first
 * drawn player beats everyone, the second beats the last two and the third beats the fourth, so the
 * points are 9, 6, 3 and 0 and no group needs a tie draw.
 */
const GROUP_BALLS = [
  [3, 1, 5, 0, 2, 4],
  [2, 6, 1, 3, 0, 5],
  [4, 0, 2, 6, 1, 3],
  [1, 5, 3, 2, 4, 0],
]

/** Played knockout matches: the winner's side and the balls the loser left. */
const KNOCKOUT_RESULTS: [MatchId, 'home' | 'away', number][] = [
  ['knockout-1-1', 'home', 2],
  ['knockout-1-2', 'away', 1],
  ['knockout-1-3', 'home', 4],
  ['knockout-1-4', 'home', 0],
  ['knockout-2-1', 'home', 3],
]

/** Left for the operator: the second semi-final and then the final. */
const PENDING_RESULTS: [MatchId, 'home' | 'away', number][] = [
  ['knockout-2-2', 'away', 2],
  ['knockout-3-1', 'home', 1],
]

/** Fixed-seed generator (mulberry32), so the draw is the same on every run. */
function seededRandom(seed: number): () => number {
  let value = seed
  return () => {
    value = (value + 0x6d2b79f5) | 0
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

/** `at` for the n-th recorded result: five minutes apart from 20:30 on the demo day. */
function resultAt(index: number): string {
  const minutes = 30 + index * 5
  const pad = (value: number) => String(value).padStart(2, '0')
  return `2026-09-26T${pad(20 + Math.floor(minutes / 60))}:${pad(minutes % 60)}:00.000Z`
}

function playKnockout(
  state: TournamentState,
  results: [MatchId, 'home' | 'away', number][],
  firstIndex: number,
): TournamentState {
  return results.reduce((current, [matchId, side, loserBallsRemaining], offset) => {
    const match = current.bracket.rounds.flatMap(round => round.matches).find(candidate => candidate.id === matchId)!
    const winnerId = (side === 'home' ? match.homePlayerId : match.awayPlayerId) as PlayerId
    return applyMatchResult(current, { matchId, winnerId, loserBallsRemaining, at: resultAt(firstIndex + offset) })
  }, state)
}

/**
 * A 16-player tournament in four groups of four, built only through the domain: every group match and
 * quarter-final is played, as is the first semi-final. The second semi-final and the final are left, so
 * the operator can record a result, try a correction that undoes later matches and reach the champion.
 */
export function createDemoTournament(): TournamentState {
  const proposal = proposeFormats(PLAYERS.length)[0] as ReadyProposal
  const drawn = createTournamentState({
    id: 'torneio-de-demonstracao',
    name: NAME,
    players: PLAYERS,
    proposal,
    draw: drawGroups(PLAYERS.map(player => player.id), proposal, seededRandom(2026)),
    createdAt: CREATED_AT,
  })

  let index = 0
  const grouped = drawn.groups.reduce((state, group, groupIndex) => {
    const order = group.playerIds
    return group.matches.reduce((current, match, matchIndex) => applyMatchResult(current, {
      matchId: match.id,
      winnerId: order.indexOf(match.player1Id) < order.indexOf(match.player2Id) ? match.player1Id : match.player2Id,
      loserBallsRemaining: GROUP_BALLS[groupIndex][matchIndex],
      at: resultAt(index++),
    }), state)
  }, drawn)
  return playKnockout(grouped, KNOCKOUT_RESULTS, index)
}

/** What the TV shows for the demo's last recorded result, and for its champion once the two pending results are in. */
export function demoPresentationStates(): { result: PresentationState; champion: PresentationState } {
  const demo = createDemoTournament()
  const finished = playKnockout(demo, PENDING_RESULTS, demo.auditLog.length)
  return {
    result: projectPresentation(demo, { type: 'result', matchId: 'knockout-2-1' }),
    champion: projectPresentation(finished, { type: 'result', matchId: 'knockout-3-1' }),
  }
}
