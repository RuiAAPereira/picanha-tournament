import { describe, expect, it } from 'vitest'
import { createRoundRobinFixtures, drawGroups, proposeFormats } from './formats'

const players = (count: number) => Array.from({ length: count }, (_, index) => `jogador-${index + 1}`)

function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

describe('proposeFormats', () => {
  it.each([
    [4, 1, 2],
    [8, 2, 4],
    [12, 3, 4],
    [16, 4, 8],
    [32, 8, 16],
  ])('recommends equal groups of four for %i players', (count, groupCount, knockoutSize) => {
    expect(proposeFormats(count)[0]).toMatchObject({
      groupSize: 4,
      groupCount,
      groupSizes: Array(groupCount).fill(4),
      knockoutSize,
      creationBlocked: false,
    })
  })

  it('uses one two-player preliminary match before three equal groups of four for 13', () => {
    const proposals = proposeFormats(13)
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
    const proposals = proposeFormats(13)
    expect(proposals[0].groupSize).toBe(4)
    expect(proposals.find(proposal => proposal.groupSize === 3)?.preliminaryRound?.matchCount).toBe(1)
    expect(proposals[0].reason).toMatch(/grupos de 4/i)
  })

  it.each([
    [12, 3, 4, { perGroup: 1, bestPlacedExtras: 1, extrasFromRank: 2 }],
    [16, 4, 8, { perGroup: 2, bestPlacedExtras: 0 }],
    [20, 5, 8, { perGroup: 1, bestPlacedExtras: 3, extrasFromRank: 2 }],
    [4, 1, 2, { perGroup: 2, bestPlacedExtras: 0 }],
  ])('defines the qualification rule for %i players', (count, groupCount, knockoutSize, qualification) => {
    const top = proposeFormats(count)[0]
    expect(top).toMatchObject({ groupSize: 4, groupCount, knockoutSize, qualification })
  })

  it('keeps knockoutSize equal to qualifiers for every proposal', () => {
    for (let count = 4; count <= 32; count++) {
      for (const proposal of proposeFormats(count)) {
        const { perGroup, bestPlacedExtras } = proposal.qualification
        expect(proposal.knockoutSize).toBe(perGroup * proposal.groupCount + bestPlacedExtras)
        expect(proposal.preliminaryRound?.matchCount ?? 0).toBeLessThanOrEqual(proposal.groupCount)
      }
    }
  })

  it('states the qualification rule in the reason', () => {
    expect(proposeFormats(12)[0].reason).toMatch(/melhor segundo classificado/i)
    expect(proposeFormats(16)[0].reason).toMatch(/2 primeiros de cada grupo/i)
    expect(proposeFormats(20)[0].reason).toMatch(/3 melhores segundos classificados/i)
    expect(proposeFormats(4)[0].reason).toMatch(/final/i)
  })

  it('writes reasons that depend on rank', () => {
    const proposals = proposeFormats(13)
    expect(proposals[0].reason).toMatch(/^Recomendado/)
    expect(proposals[1].reason).toMatch(/^Alternativa/)
    expect(proposals.slice(1).every(proposal => /^Alternativa/.test(proposal.reason))).toBe(true)
    expect(proposeFormats(16)[1].reason).toMatch(/em vez de|pré-eliminatória/)
  })

  it('ranks clean formats before preliminary ones', () => {
    expect(proposeFormats(6)[0]).toMatchObject({ groupSize: 3, groupCount: 2, preliminaryRound: undefined })
    expect(proposeFormats(9)[0]).toMatchObject({ groupSize: 3, groupCount: 3, preliminaryRound: undefined })
    expect(proposeFormats(15)[0].preliminaryRound).toBeUndefined()
    expect(proposeFormats(7)[0]).toMatchObject({
      groupSize: 3, groupCount: 2, preliminaryRound: { matchCount: 1, entrantsToDraw: 2, advancingCount: 1 },
    })
  })

  it('never proposes more preliminary matches than groups', () => {
    expect(proposeFormats(8).some(proposal => proposal.groupCount === 1 && proposal.groupSize === 4)).toBe(false)
    for (const count of [7, 8, 10, 14]) {
      expect(proposeFormats(count).every(proposal =>
        (proposal.preliminaryRound?.matchCount ?? 0) <= proposal.groupCount)).toBe(true)
    }
  })

  it('blocks with a zero qualification rule', () => {
    expect(proposeFormats(3)[0].qualification).toEqual({ perGroup: 0, bestPlacedExtras: 0 })
  })

  it('blocks an unsupported player count with an explanation', () => {
    expect(proposeFormats(3)[0]).toMatchObject({ creationBlocked: true })
    expect(proposeFormats(33)[0].reason).toMatch(/4 a 32/i)
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
    const proposal = proposeFormats(14)[0]
    expect(proposal.preliminaryRound?.matchCount).toBe(2)
    const first = drawGroups(players(14), proposal, seededRandom(5))
    expect(first).toEqual(drawGroups(players(14), proposal, seededRandom(5)))
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

  it('rejects duplicate entrants and a proposal for a different count', () => {
    expect(() => drawGroups(['a', 'a', 'b', 'c'], proposeFormats(4)[0], seededRandom(1))).toThrow()
    expect(() => drawGroups(players(8), proposeFormats(4)[0], seededRandom(1))).toThrow()
  })
})

describe('createRoundRobinFixtures', () => {
  it('creates exactly one fixture for each pair in a four-player group', () => {
    const fixtures = createRoundRobinFixtures('A', ['a', 'b', 'c', 'd'])
    expect(fixtures).toHaveLength(6)
    expect(fixtures.every(fixture => fixture.groupId === 'A')).toBe(true)
    expect(fixtures.map(fixture => [fixture.player1Id, fixture.player2Id].sort().join('-')).sort()).toEqual([
      'a-b', 'a-c', 'a-d', 'b-c', 'b-d', 'c-d',
    ])
    expect(new Set(fixtures.map(fixture => fixture.id)).size).toBe(6)
  })

  it('rejects duplicate entrants so a player cannot face themself', () => {
    expect(() => createRoundRobinFixtures('A', ['a', 'a', 'b'])).toThrow()
  })
})
