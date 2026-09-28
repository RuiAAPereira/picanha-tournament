import { qualificationFor, type Qualification } from './formats'
import { applyTieDraws, pendingTies } from './tiebreak'
import type { GroupStanding, MatchId, MatchResult, PlayerId } from './types'

export type Seed = { group: string; rank: 1 | 2 }

/** Where a knockout player comes from: a fixed group place, a best-placed crossing, or a previous winner. */
export type Slot =
  | { type: 'group'; group: string; rank: 1 | 2 }
  | { type: 'crossing'; match: number; side: 'home' | 'away' }
  | { type: 'winner'; matchId: MatchId }

export type KnockoutMatch = {
  id: MatchId
  round: number
  home: Slot
  away: Slot
  homePlayerId: PlayerId | null
  awayPlayerId: PlayerId | null
  result?: MatchResult
}

export type KnockoutRound = { matches: KnockoutMatch[] }

export type Bracket = { qualification: Qualification; rounds: KnockoutRound[] }

/** A group as the bracket sees it: standings with stored draws already applied. */
export type GroupOutcome = { id: string; finished: boolean; standings: GroupStanding[] }

const groupLetter = (index: number) => String.fromCharCode(65 + index)
const knockoutId = (round: number, index: number) => `knockout-${round + 1}-${index + 1}`
const groupSlot = (index: number, rank: 1 | 2): Slot => ({ type: 'group', group: groupLetter(index), rank })
const isPowerOfTwo = (value: number) => Number.isInteger(value) && value >= 2 && (value & (value - 1)) === 0

function roundOneSlots(groupCount: number, qualification: Qualification): [Slot, Slot][] {
  if (qualification.perGroup === 1) {
    const count = (groupCount + qualification.bestPlacedExtras) / 2
    return Array.from({ length: count }, (_, match): [Slot, Slot] =>
      [{ type: 'crossing', match, side: 'home' }, { type: 'crossing', match, side: 'away' }])
  }
  if (groupCount === 1) return [[groupSlot(0, 1), groupSlot(0, 2)]]
  // Winners of paired groups meet the other group's runner-up; the reversed crossings form the second half.
  const pairs = Array.from({ length: groupCount / 2 }, (_, pair) => pair * 2)
  return [
    ...pairs.map((first): [Slot, Slot] => [groupSlot(first, 1), groupSlot(first + 1, 2)]),
    ...pairs.map((first): [Slot, Slot] => [groupSlot(first + 1, 1), groupSlot(first, 2)]),
  ]
}

/** Builds the bracket from fixed slots; only the number of groups matters, players are placed by resolveBracket. */
export function createKnockoutBracket(
  groups: GroupStanding[][],
  knockoutSize: number,
  qualification?: Qualification,
): Bracket {
  const groupCount = groups.length
  const rule = qualification ?? qualificationFor(groupCount).qualification
  const expectedSize = rule.perGroup === 2 ? groupCount * 2 : groupCount + rule.bestPlacedExtras
  if (
    groupCount < 1 || knockoutSize !== expectedSize || !isPowerOfTwo(knockoutSize)
    || (rule.perGroup === 1 && (rule.bestPlacedExtras < 1 || rule.bestPlacedExtras >= groupCount))
  ) {
    throw new Error('A fase final não corresponde à qualificação dos grupos.')
  }

  const rounds: KnockoutRound[] = []
  let slots = roundOneSlots(groupCount, rule)
  for (let round = 0; slots.length > 0; round++) {
    const matches = slots.map(([home, away], index): KnockoutMatch =>
      ({ id: knockoutId(round, index), round, home, away, homePlayerId: null, awayPlayerId: null }))
    rounds.push({ matches })
    slots = matches.length === 1 ? [] : Array.from({ length: matches.length / 2 }, (_, index): [Slot, Slot] => [
      { type: 'winner', matchId: matches[index * 2].id },
      { type: 'winner', matchId: matches[index * 2 + 1].id },
    ])
  }
  return { qualification: rule, rounds }
}

/**
 * Round one when only group winners and the best runners-up qualify. Runners-up, best first, take the
 * winner of the latest group not yet taken and not their own; the remaining winners meet in group order.
 */
export function crossRunnersUp(groupIds: string[], runnerUpGroups: string[]): [Seed, Seed][] {
  if (runnerUpGroups.length >= groupIds.length || (groupIds.length - runnerUpGroups.length) % 2 !== 0) {
    throw new RangeError('Os segundos classificados não completam a fase final.')
  }
  const opponents = new Map<string, string>()
  for (const runnerUp of runnerUpGroups) {
    const winner = [...groupIds].reverse().find(group => group !== runnerUp && !opponents.has(group))!
    opponents.set(winner, runnerUp)
  }
  const pairs: [Seed, Seed][] = [...opponents].map(([winner, runnerUp]) =>
    [{ group: winner, rank: 1 }, { group: runnerUp, rank: 2 }])
  const rest = groupIds.filter(group => !opponents.has(group))
  for (let index = 0; index < rest.length; index += 2) {
    pairs.push([{ group: rest[index], rank: 1 }, { group: rest[index + 1], rank: 1 }])
  }
  return pairs.sort(([a], [b]) => a.group.localeCompare(b.group))
}

/** The player holding a group place, once the group is finished and the place is not tied. */
export function seedPlayer(outcome: GroupOutcome, rank: 1 | 2): PlayerId | null {
  if (!outcome.finished) return null
  return outcome.standings.find(row => row.rank === rank && !row.requiresDraw)?.playerId ?? null
}

/**
 * Orders all runners-up by points, then fewest balls left, then stored draws (no head-to-head across
 * groups). A tie reaching the qualifying places must be drawn, since it decides who plays whom.
 */
export function rankRunnersUp(
  outcomes: GroupOutcome[],
  draws: PlayerId[][],
  extras: number,
): { order: PlayerId[] | null; pendingTies: PlayerId[][] } {
  const runnersUp = outcomes.map(outcome => outcome.standings.find(row => row.rank === 2 && !row.requiresDraw))
  if (!outcomes.every(outcome => outcome.finished) || runnersUp.some(row => !row)) {
    return { order: null, pendingTies: [] }
  }
  const sorted = (runnersUp as GroupStanding[])
    .map(row => ({ ...row, headToHeadResult: null }))
    .sort((a, b) => b.points - a.points || a.ballsLeft - b.ballsLeft)
  const tied = (a?: GroupStanding, b?: GroupStanding) => !!a && !!b && a.points === b.points && a.ballsLeft === b.ballsLeft
  const ranked = sorted.map((row, index): GroupStanding => ({ ...row, rank: 0, requiresDraw: tied(row, sorted[index - 1]) || tied(row, sorted[index + 1]) }))
  ranked.forEach((row, index) => { row.rank = tied(row, ranked[index - 1]) ? ranked[index - 1].rank : index + 1 })

  const drawn = applyTieDraws(ranked, draws)
  const pending = pendingTies(drawn).filter(tie => drawn.find(row => row.playerId === tie[0])!.rank <= extras)
  return pending.length > 0
    ? { order: null, pendingTies: pending }
    : { order: drawn.map(row => row.playerId), pendingTies: [] }
}

/**
 * Places players into every slot whose source is decided and advances winners. A stored result is kept
 * only while the match keeps the same two players; otherwise it no longer describes that match.
 */
export function resolveBracket(bracket: Bracket, outcomes: GroupOutcome[], runnerUpDraws: PlayerId[][]): Bracket {
  const outcomeOf = (group: string) => outcomes.find(outcome => outcome.id === group)
  const { qualification } = bracket
  let crossings: (PlayerId | null)[][] = []
  if (qualification.perGroup === 1) {
    const { order } = rankRunnersUp(outcomes, runnerUpDraws, qualification.bestPlacedExtras)
    if (order && outcomes.every(outcome => seedPlayer(outcome, 1))) {
      const groupOfPlayer = (playerId: PlayerId) =>
        outcomes.find(outcome => outcome.standings.some(row => row.playerId === playerId))!.id
      crossings = crossRunnersUp(outcomes.map(outcome => outcome.id),
        order.slice(0, qualification.bestPlacedExtras).map(groupOfPlayer))
        .map(pair => pair.map(seed => seedPlayer(outcomeOf(seed.group)!, seed.rank)))
    }
  }

  const winners = new Map<MatchId, PlayerId>()
  const occupant = (slot: Slot): PlayerId | null => {
    switch (slot.type) {
      case 'group': {
        const outcome = outcomeOf(slot.group)
        return outcome ? seedPlayer(outcome, slot.rank) : null
      }
      case 'crossing': return crossings[slot.match]?.[slot.side === 'home' ? 0 : 1] ?? null
      case 'winner': return winners.get(slot.matchId) ?? null
    }
  }

  return {
    ...bracket,
    rounds: bracket.rounds.map(round => ({
      matches: round.matches.map(({ result, ...match }): KnockoutMatch => {
        const homePlayerId = occupant(match.home)
        const awayPlayerId = occupant(match.away)
        const keep = result && homePlayerId && awayPlayerId
          && homePlayerId === match.homePlayerId && awayPlayerId === match.awayPlayerId
        if (!keep) return { ...match, homePlayerId, awayPlayerId }
        winners.set(match.id, result.winnerId)
        return { ...match, homePlayerId, awayPlayerId, result }
      }),
    })),
  }
}
