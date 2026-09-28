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
    expect(proposals[0].reason).toMatch(/preferência por grupos de 4/i)
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
