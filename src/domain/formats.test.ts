import { describe, expect, it } from 'vitest'
import { createRoundRobinFixtures, drawGroups, proposeFormats } from './formats'

const players = (count: number) => Array.from({ length: count }, (_, index) => `jogador-${index + 1}`)
const matchesOf = (proposal: { preliminaryRound?: { matchCount: number } }) => proposal.preliminaryRound?.matchCount ?? 0

function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function ready(count: number, preferredGroupSize?: number) {
  return proposeFormats(count, preferredGroupSize).map(proposal => {
    if (proposal.creationBlocked) throw new Error(`Proposta bloqueada para ${count} jogadores`)
    return proposal
  })
}

describe('proposeFormats', () => {
  it.each([
    [4, 1, 2],
    [8, 2, 4],
    [12, 3, 4],
    [16, 4, 8],
    [32, 8, 16],
  ])('recommends equal groups of four for %i players', (count, groupCount, knockoutSize) => {
    expect(ready(count)[0]).toMatchObject({
      groupSize: 4,
      groupCount,
      groupSizes: Array(groupCount).fill(4),
      knockoutSize,
      creationBlocked: false,
    })
  })

  it('uses one two-player preliminary match before three equal groups of four for 13', () => {
    const proposals = ready(13)
    expect(proposals[0]).toMatchObject({
      groupSize: 4,
      groupCount: 3,
      groupSizes: [4, 4, 4],
      knockoutSize: 4,
      preliminaryRound: { matchCount: 1, entrantsToDraw: 2, advancingCount: 1 },
      creationBlocked: false,
    })
    expect(proposals.every(proposal => proposal.groupSizes.every(size => size === proposal.groupSizes[0]))).toBe(true)
    expect(proposals[0].reason).toMatch(/pré-eliminatória/i)
  })

  it('ranks group-size distance before preliminary count', () => {
    const proposals = ready(22)
    expect(proposals[0]).toMatchObject({ groupSize: 4, groupCount: 5, preliminaryRound: { matchCount: 2 } })
    expect(proposals.find(proposal => proposal.groupSize === 3 && proposal.groupCount === 7)?.preliminaryRound?.matchCount).toBe(1)
  })

  it.each([
    [12, 5, 4, 3],
    [16, 3, 4, 4],
    [20, 5, 5, 4],
  ])('honours the preferred group size for %i players (preferred %i)', (count, preferred, groupSize, groupCount) => {
    const top = ready(count, preferred)[0]
    expect(top).toMatchObject({ groupSize, groupCount })
    expect(top.preliminaryRound).toBeUndefined()
  })

  it.each([2, 6, 4.5])('rejects preferred group size %s', preferred => {
    expect(() => proposeFormats(16, preferred)).toThrow(RangeError)
  })

  it.each([3, 33, 12.5])('blocks %s players with an explanation', count => {
    const [proposal, ...rest] = proposeFormats(count)
    expect(rest).toEqual([])
    expect(proposal.creationBlocked).toBe(true)
    expect(proposal.reason).toMatch(/4 a 32/)
  })

  it.each([
    [12, 3, 4, { perGroup: 1, bestPlacedExtras: 1, extrasFromRank: 2 }],
    [16, 4, 8, { perGroup: 2, bestPlacedExtras: 0 }],
    [20, 5, 8, { perGroup: 1, bestPlacedExtras: 3, extrasFromRank: 2 }],
    [4, 1, 2, { perGroup: 2, bestPlacedExtras: 0 }],
  ])('defines the qualification rule for %i players', (count, groupCount, knockoutSize, qualification) => {
    expect(ready(count)[0]).toMatchObject({ groupSize: 4, groupCount, knockoutSize, qualification })
  })

  it('keeps every proposal equal, qualified and within the preliminary limit', () => {
    for (let count = 4; count <= 32; count++) {
      for (const preferred of [3, 4, 5]) {
        for (const proposal of ready(count, preferred)) {
          const { perGroup, bestPlacedExtras } = proposal.qualification
          expect(proposal.knockoutSize).toBe(perGroup * proposal.groupCount + bestPlacedExtras)
          expect(matchesOf(proposal)).toBeLessThanOrEqual(proposal.groupCount)
          expect(proposal.groupCount * proposal.groupSize + matchesOf(proposal)).toBe(count)
        }
      }
    }
  })

  it('states the qualification rule in the reason', () => {
    expect(ready(12)[0].reason).toMatch(/melhor segundo classificado/i)
    expect(ready(16)[0].reason).toMatch(/2 primeiros de cada grupo/i)
    expect(ready(20)[0].reason).toMatch(/3 melhores segundos classificados/i)
    expect(ready(4)[0].reason).toMatch(/final entre o 1\.º e o 2\.º classificados/)
    expect(ready(4)[0].reason).not.toMatch(/fase final de 2/)
  })

  it('writes ranked reasons', () => {
    const proposals = ready(13)
    expect(proposals[0].reason).toMatch(/^Recomendado/)
    expect(proposals.slice(1).every(proposal => /^Alternativa/.test(proposal.reason))).toBe(true)
    expect(ready(16)[1].reason).toMatch(
      /^Alternativa \(grupos de 3 em vez de 4, 5 grupos em vez de 4, exige 1 pré-eliminatória\)/)
    expect(ready(16)[0].reason).not.toMatch(/\+\d/)
  })

  it('never makes a top-reason claim that an alternative contradicts', () => {
    for (let count = 4; count <= 32; count++) {
      for (const preferred of [3, 4, 5]) {
        const [top, ...others] = ready(count, preferred)
        const all = [top, ...others]
        if (/menor número de pré-eliminatórias/.test(top.reason)) {
          expect(all.every(proposal => matchesOf(proposal) >= matchesOf(top))).toBe(true)
        }
        if (/^Recomendado \(sem pré-eliminatória/.test(top.reason)) expect(matchesOf(top)).toBe(0)
        if (/tamanho de grupo preferido/.test(top.reason)) expect(top.groupSize).toBe(preferred)
        if (/exigiriam pré-eliminatória/.test(top.reason)) {
          const preferredOptions = all.filter(proposal => proposal.groupSize === preferred)
          expect(preferredOptions.length).toBeGreaterThan(0)
          expect(preferredOptions.every(proposal => matchesOf(proposal) > 0)).toBe(true)
        }
      }
    }
  })

  it.each([
    [22, 4, /^Recomendado \(tamanho de grupo preferido\)/, /menor número/],
    [12, 5, /grupos de 5 exigiriam pré-eliminatória/, /tamanho de grupo preferido/],
    [16, 3, /grupos de 3 exigiriam pré-eliminatória/, /tamanho de grupo preferido/],
  ])('states the real ranking reason for %i players (preferred %i)', (count, preferred, expected, forbidden) => {
    const reason = ready(count, preferred)[0].reason
    expect(reason).toMatch(expected)
    expect(reason).not.toMatch(forbidden)
  })

  it.each([[16, 3], [22, 4]])('gives every alternative a unique reason for %i players (preferred %i)', (count, preferred) => {
    const reasons = ready(count, preferred).map(proposal => proposal.reason)
    expect(new Set(reasons).size).toBe(reasons.length)
  })

  it('says how many preliminaries an alternative requires, with "mais" and "menos"', () => {
    const reasons = ready(22, 4).map(proposal => proposal.reason)
    expect(reasons.some(reason => /mais 2 pré-eliminatórias/.test(reason))).toBe(true)
    expect(reasons.some(reason => /menos 1 pré-eliminatória[,)]/.test(reason))).toBe(true)
    expect(ready(16)[1].reason).toMatch(/exige 1 pré-eliminatória/)
    expect(ready(16).some(proposal => /exige 4 pré-eliminatórias/.test(proposal.reason))).toBe(true)
  })

  it('sends a preliminary winner to "o grupo" when there is only one group', () => {
    const single = ready(5).find(proposal => proposal.groupCount === 1 && matchesOf(proposal) === 1)!
    expect(single.reason).toMatch(/1 vencedor avança para o grupo,/)
    expect(ready(13)[0].reason).toMatch(/1 vencedor avança para os grupos,/)
  })

  it('says "um dos tamanhos mais próximos" when groups of 3 and 5 are equally close', () => {
    expect(ready(7, 4)[0].reason).toMatch(/^Recomendado \(um dos tamanhos de grupo mais próximos do preferido;/)
    expect(ready(7, 3)[0].reason).not.toMatch(/mais próximo/)
    const nearest = ready(7, 5)[0]
    expect(nearest.groupSize).toBe(3)
    expect(nearest.reason).toMatch(/\(tamanho de grupo mais próximo do preferido;/)
  })

  it('ranks clean formats before preliminary ones', () => {
    expect(ready(6)[0]).toMatchObject({ groupSize: 3, groupCount: 2, preliminaryRound: undefined })
    expect(ready(9)[0]).toMatchObject({ groupSize: 3, groupCount: 3, preliminaryRound: undefined })
    expect(ready(15)[0].preliminaryRound).toBeUndefined()
    expect(ready(7)[0]).toMatchObject({
      groupSize: 3, groupCount: 2, preliminaryRound: { matchCount: 1, entrantsToDraw: 2, advancingCount: 1 },
    })
  })

  it('does not propose one group of four with four preliminaries for 8', () => {
    expect(ready(8).some(proposal => proposal.groupCount === 1 && proposal.groupSize === 4)).toBe(false)
  })
})

describe('drawGroups', () => {
  it('reproduces the same one-pot draw from the same random source', () => {
    const proposal = proposeFormats(16)[0]
    const first = drawGroups(players(16), proposal, seededRandom(42))
    const second = drawGroups(players(16), proposal, seededRandom(42))
    expect(first).toEqual(second)
    expect(first.groups.map(group => group.playerIds.length)).toEqual([4, 4, 4, 4])
    expect(first.groups.flatMap(group => group.playerIds).sort()).toEqual(players(16).sort())
    expect(first.shuffledPlayerIds).not.toEqual(players(16))
  })

  it('draws two of 13 entrants into one preliminary match and reserves one winner slot', () => {
    const result = drawGroups(players(13), proposeFormats(13)[0], seededRandom(12))
    expect(result.preliminaryMatches).toHaveLength(1)
    const preliminary = result.preliminaryMatches[0]
    expect(preliminary.player1Id).not.toBe(preliminary.player2Id)
    expect(result.preliminaryPlayerIds).toEqual([preliminary.player1Id, preliminary.player2Id])
    expect(result.groups.reduce((sum, group) => sum + group.playerIds.length, 0)).toBe(11)
    expect(result.groups.reduce((sum, group) => sum + group.preliminaryWinnerMatchIds.length, 0)).toBe(1)
    expect(result.groups.map(group => group.playerIds.length + group.preliminaryWinnerMatchIds.length)).toEqual([4, 4, 4])
    expect([...result.preliminaryPlayerIds, ...result.groups.flatMap(group => group.playerIds)].sort()).toEqual(players(13).sort())
  })

  it('spreads preliminary winner slots across groups from the same random source', () => {
    const proposal = ready(14)[0]
    expect(matchesOf(proposal)).toBe(2)
    expect(drawGroups(players(14), proposal, seededRandom(5))).toEqual(drawGroups(players(14), proposal, seededRandom(5)))
    const firstMatchGroups = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) {
      const result = drawGroups(players(14), proposal, seededRandom(seed))
      expect(result.groups.map(group => group.id)).toEqual(['A', 'B', 'C'])
      expect(result.groups.every(group => group.preliminaryWinnerMatchIds.length <= 1)).toBe(true)
      expect(result.groups.every(group => group.playerIds.length + group.preliminaryWinnerMatchIds.length === 4)).toBe(true)
      expect(result.groups.flatMap(group => group.preliminaryWinnerMatchIds).sort()).toEqual(['preliminary-1', 'preliminary-2'])
      firstMatchGroups.add(result.groups.find(group => group.preliminaryWinnerMatchIds.includes('preliminary-1'))!.id)
    }
    expect(firstMatchGroups.size).toBeGreaterThan(1)
  })

  it('rejects a random source outside [0, 1)', () => {
    expect(() => drawGroups(players(16), proposeFormats(16)[0], () => 1)).toThrow(RangeError)
    expect(() => drawGroups(players(16), proposeFormats(16)[0], () => Number.NaN)).toThrow(RangeError)
  })

  it('rejects duplicate entrants and a proposal for a different count', () => {
    expect(() => drawGroups(['a', 'a', 'b', 'c'], proposeFormats(4)[0], seededRandom(1))).toThrow()
    expect(() => drawGroups(players(8), proposeFormats(4)[0], seededRandom(1))).toThrow()
  })

  it('rejects a blocked proposal', () => {
    expect(() => drawGroups(players(3), proposeFormats(3)[0], seededRandom(1))).toThrow()
  })

  it('rejects hand-built proposals whose slots do not add up', () => {
    const base = ready(13)[0]
    const badSize = { ...base, groupSize: 5 }
    const tooManyPreliminaries = {
      ...base,
      groupSize: 2,
      groupCount: 3,
      preliminaryRound: { matchCount: 7, entrantsToDraw: 14, advancingCount: 7 },
    }
    expect(() => drawGroups(players(13), badSize, seededRandom(1))).toThrow(/formato/i)
    expect(() => drawGroups(players(13), tooManyPreliminaries, seededRandom(1))).toThrow(/formato/i)
  })
})

describe('createRoundRobinFixtures', () => {
  const pairKey = (fixture: { player1Id: string; player2Id: string }) => [fixture.player1Id, fixture.player2Id].sort().join('-')

  it.each([3, 4, 5])('creates exactly one fixture for each pair of %i players', count => {
    const ids = players(count)
    const fixtures = createRoundRobinFixtures('A', ids)
    const expected = ids.flatMap((first, index) => ids.slice(index + 1).map(second => [first, second].sort().join('-'))).sort()
    expect(fixtures.map(pairKey).sort()).toEqual(expected)
    expect(fixtures.every(fixture => fixture.groupId === 'A')).toBe(true)
    expect(new Set(fixtures.map(fixture => fixture.id)).size).toBe(fixtures.length)
    expect(createRoundRobinFixtures('A', ids)).toEqual(fixtures)
  })

  it('orders four players by round so no player plays three in a row', () => {
    const fixtures = createRoundRobinFixtures('A', ['a', 'b', 'c', 'd'])
    // a rest-free order is impossible for four players: consecutive disjoint pairs would have to repeat.
    // Fixtures within a round are disjoint; between rounds exactly one player repeats.
    for (let round = 0; round < 3; round++) {
      const [first, second] = fixtures.slice(round * 2, round * 2 + 2)
      expect(new Set([first.player1Id, first.player2Id, second.player1Id, second.player2Id]).size).toBe(4)
    }
    for (const boundary of [1, 3]) {
      const [last, next] = [fixtures[boundary], fixtures[boundary + 1]]
      expect(new Set([last.player1Id, last.player2Id, next.player1Id, next.player2Id]).size).toBe(3)
    }
    for (let index = 0; index + 2 < fixtures.length; index++) {
      const window = fixtures.slice(index, index + 3)
      for (const id of ['a', 'b', 'c', 'd']) {
        expect(window.every(fixture => fixture.player1Id === id || fixture.player2Id === id)).toBe(false)
      }
    }
  })

  it('rejects duplicate entrants, groups without two players and empty group ids', () => {
    expect(() => createRoundRobinFixtures('A', ['a', 'a', 'b'])).toThrow()
    expect(() => createRoundRobinFixtures('A', ['a'])).toThrow()
    expect(() => createRoundRobinFixtures('A', [])).toThrow()
    expect(() => createRoundRobinFixtures('', ['a', 'b'])).toThrow()
  })
})
