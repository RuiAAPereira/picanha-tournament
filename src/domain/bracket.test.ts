import { describe, expect, it } from 'vitest'
import {
  createKnockoutBracket, crossRunnersUp, rankRunnersUp, resolveBracket,
  type Bracket, type GroupOutcome, type Seed,
} from './bracket'
import { qualificationFor } from './formats'
import type { GroupStanding } from './types'

function standing(playerId: string, points: number, rank: number, requiresDraw = false, ballsLeft = 0): GroupStanding {
  return { playerId, points, ballsLeft, headToHeadResult: null, rank, requiresDraw }
}

/** A finished group whose players are ranked in the given order with distinct points. */
function finishedGroup(id: string, size = 4): GroupOutcome {
  return {
    id,
    finished: true,
    standings: Array.from({ length: size }, (_, index) =>
      standing(`${id.toLowerCase()}${index + 1}`, (size - 1 - index) * 3, index + 1)),
  }
}

const letters = (count: number) => Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index))
const emptyGroups = (count: number): GroupStanding[][] => Array.from({ length: count }, () => [])

function roundOneSeeds(bracket: Bracket) {
  return bracket.rounds[0].matches.map(match => [match.home, match.away])
}

function orderedSelections(items: string[], size: number): string[][] {
  if (size === 0) return [[]]
  return items.flatMap(item =>
    orderedSelections(items.filter(other => other !== item), size - 1).map(rest => [item, ...rest]))
}

describe('createKnockoutBracket', () => {
  it('crosses the winner of group A with the runner-up of group B', () => {
    const groupA = finishedGroup('A').standings
    const groupB = finishedGroup('B').standings
    expect(createKnockoutBracket([groupA, groupB], 4).rounds[0].matches[0]).toMatchObject({
      home: { group: 'A', rank: 1 }, away: { group: 'B', rank: 2 },
    })
  })

  it('plays a single group as a final between first and second', () => {
    const bracket = createKnockoutBracket(emptyGroups(1), 2)
    expect(bracket.rounds).toHaveLength(1)
    expect(bracket.rounds[0].matches).toEqual([expect.objectContaining({
      home: { type: 'group', group: 'A', rank: 1 },
      away: { type: 'group', group: 'A', rank: 2 },
      homePlayerId: null,
      awayPlayerId: null,
    })])
  })

  it('orders round one as winners of the first half, then the reversed crossings', () => {
    expect(roundOneSeeds(createKnockoutBracket(emptyGroups(4), 8)).map(([home, away]) =>
      `${'group' in home ? home.group + home.rank : ''}-${'group' in away ? away.group + away.rank : ''}`))
      .toEqual(['A1-B2', 'C1-D2', 'B1-A2', 'D1-C2'])
  })

  it.each([2, 4, 8])('keeps the two qualifiers of each group in opposite halves (%i groups)', groupCount => {
    const bracket = createKnockoutBracket(emptyGroups(groupCount), groupCount * 2)
    const firstRound = bracket.rounds[0].matches
    const half = firstRound.length / 2
    for (const group of letters(groupCount)) {
      const indexOf = (rank: 1 | 2) => firstRound.findIndex(match =>
        [match.home, match.away].some(slot => slot.type === 'group' && slot.group === group && slot.rank === rank))
      expect(indexOf(1) < half).not.toBe(indexOf(2) < half)
    }
  })

  it('feeds later rounds from the winners of adjacent matches', () => {
    const bracket = createKnockoutBracket(emptyGroups(4), 8)
    expect(bracket.rounds.map(round => round.matches.length)).toEqual([4, 2, 1])
    expect(bracket.rounds[1].matches[1]).toMatchObject({
      id: 'knockout-2-2',
      round: 2,
      home: { type: 'winner', matchId: 'knockout-1-3' },
      away: { type: 'winner', matchId: 'knockout-1-4' },
    })
    expect(bracket.rounds[2].matches[0].id).toBe('knockout-3-1')
  })

  it('derives the qualification from the shared rule and defers best-placed crossings', () => {
    const bracket = createKnockoutBracket(emptyGroups(5), 8)
    expect(bracket.qualification).toEqual(qualificationFor(5).qualification)
    expect(bracket.rounds[0].matches[2]).toMatchObject({
      home: { type: 'crossing', pairIndex: 2, side: 'home' },
      away: { type: 'crossing', pairIndex: 2, side: 'away' },
    })
  })

  it('rejects a knockout size that does not match the qualification', () => {
    expect(() => createKnockoutBracket(emptyGroups(3), 8)).toThrow(/fase final/i)
    expect(() => createKnockoutBracket(emptyGroups(0), 2)).toThrow(/grupos/i)
  })
})

describe('crossRunnersUp', () => {
  it('gives the best runner-up the winner of the latest other group', () => {
    const pair = (home: string, away: string): [Seed, Seed] =>
      [{ group: home[0], rank: Number(home[1]) as 1 | 2 }, { group: away[0], rank: Number(away[1]) as 1 | 2 }]
    expect(crossRunnersUp(['A', 'B', 'C'], ['C'])).toEqual([pair('A1', 'C1'), pair('B1', 'C2')])
    expect(crossRunnersUp(['A', 'B', 'C'], ['A'])).toEqual([pair('A1', 'B1'), pair('C1', 'A2')])
  })

  it.each([3, 5, 6])('never pairs a runner-up with its own group winner (%i groups)', groupCount => {
    const groups = letters(groupCount)
    const { knockoutSize, qualification } = qualificationFor(groupCount)
    for (const runnersUp of orderedSelections(groups, qualification.bestPlacedExtras)) {
      const pairs = crossRunnersUp(groups, runnersUp)
      expect(pairs).toHaveLength(knockoutSize / 2)
      expect(pairs.every(([home, away]) => home.rank === 1 && home.group !== away.group)).toBe(true)
      expect(pairs.map(([home]) => home.group)).toEqual([...pairs.map(([home]) => home.group)].sort())
      const seeds = pairs.flat().map(seed => seed.group + seed.rank).sort()
      expect(seeds).toEqual([...groups.map(group => group + 1), ...runnersUp.map(group => group + 2)].sort())
    }
  })
})

describe('rankRunnersUp', () => {
  const group = (id: string, runnerUpPoints: number, runnerUpBalls = 0, finished = true): GroupOutcome => ({
    id,
    finished,
    standings: [standing(`${id}1`, 9, 1), standing(`${id}2`, runnerUpPoints, 2, false, runnerUpBalls), standing(`${id}3`, 0, 3)],
  })

  it('ranks runners-up by points then fewest balls left', () => {
    expect(rankRunnersUp([group('A', 3, 2), group('B', 6), group('C', 3, 1)], [], 2)).toEqual({
      status: 'ready',
      order: ['B2', 'C2', 'A2'],
    })
  })

  it('waits for every group to finish', () => {
    expect(rankRunnersUp([group('A', 3), group('B', 6, 0, false)], [], 1)).toEqual({ status: 'waiting' })
  })

  it('reports a group whose second place is still tied', () => {
    const tiedB: GroupOutcome = {
      id: 'B',
      finished: true,
      standings: [standing('B1', 6, 1), standing('B2', 3, 2, true), standing('B3', 3, 2, true)],
    }
    expect(rankRunnersUp([group('A', 3), tiedB], [], 1)).toEqual({ status: 'groupTie', groupId: 'B' })
  })

  it('requires a draw for a tie that reaches the qualifying places and applies a stored draw', () => {
    const groups = [group('A', 3), group('B', 3), group('C', 6)]
    expect(rankRunnersUp(groups, [], 2)).toEqual({ status: 'drawNeeded', pendingTies: [['A2', 'B2']] })
    expect(rankRunnersUp(groups, [['B2', 'A2']], 2)).toEqual({ status: 'ready', order: ['C2', 'B2', 'A2'] })
    expect(rankRunnersUp(groups, [], 1)).toEqual({ status: 'ready', order: ['C2', 'A2', 'B2'] })
  })
})

describe('resolveBracket', () => {
  it('fills group slots only for finished groups with decided places', () => {
    const bracket = createKnockoutBracket(emptyGroups(2), 4)
    const unfinishedB: GroupOutcome = { ...finishedGroup('B'), finished: false }
    const resolved = resolveBracket(bracket, [finishedGroup('A'), unfinishedB], [])
    expect(resolved.rounds[0].matches.map(match => [match.homePlayerId, match.awayPlayerId]))
      .toEqual([['a1', null], [null, 'a2']])

    const tiedA: GroupOutcome = {
      id: 'A',
      finished: true,
      standings: [standing('a1', 6, 1), standing('a2', 3, 2, true), standing('a3', 3, 2, true)],
    }
    expect(resolveBracket(bracket, [tiedA, finishedGroup('B')], []).rounds[0].matches
      .map(match => [match.homePlayerId, match.awayPlayerId])).toEqual([['a1', 'b2'], ['b1', null]])
  })

  it('resolves best-placed crossings only when every group is finished', () => {
    const bracket = createKnockoutBracket(emptyGroups(3), 4)
    const groups = [finishedGroup('A', 3), finishedGroup('B', 3), finishedGroup('C', 3)]
    groups[2].standings[1] = { ...groups[2].standings[1], points: 4 }
    const pending = resolveBracket(bracket, [...groups.slice(0, 2), { ...groups[2], finished: false }], [])
    expect(pending.rounds[0].matches.every(match => !match.homePlayerId && !match.awayPlayerId)).toBe(true)
    expect(resolveBracket(bracket, groups, []).rounds[0].matches.map(match => [match.homePlayerId, match.awayPlayerId]))
      .toEqual([['a1', 'c1'], ['b1', 'c2']])
  })

  it('advances winners and drops results whose players changed', () => {
    const groups = [finishedGroup('A'), finishedGroup('B')]
    const resolved = resolveBracket(createKnockoutBracket(emptyGroups(2), 4), groups, [])
    const [semiFinal] = resolved.rounds[0].matches
    const played: Bracket = {
      ...resolved,
      rounds: [
        { matches: [{ ...semiFinal, result: { winnerId: 'b2', loserBallsRemaining: 3, kind: 'played' } }, resolved.rounds[0].matches[1]] },
        resolved.rounds[1],
      ],
    }
    const advanced = resolveBracket(played, groups, [])
    expect(advanced.rounds[1].matches[0]).toMatchObject({ homePlayerId: 'b2', awayPlayerId: null })

    const swappedB: GroupOutcome = {
      ...groups[1],
      standings: [groups[1].standings[0], { ...groups[1].standings[2], rank: 2 }, { ...groups[1].standings[1], rank: 3 }, groups[1].standings[3]],
    }
    const changed = resolveBracket(advanced, [groups[0], swappedB], [])
    expect(changed.rounds[0].matches[0]).not.toHaveProperty('result')
    expect(changed.rounds[0].matches[0].awayPlayerId).toBe('b3')
    expect(changed.rounds[1].matches[0].homePlayerId).toBeNull()
  })
})
