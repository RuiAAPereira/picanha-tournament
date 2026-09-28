import { describe, expect, it } from 'vitest'
import { ALL_BALLS_REMAINING, calculateStandings, recordResult } from './standings'
import type { TournamentMatch } from './types'

function match(id: string, player1Id: string, player2Id: string): TournamentMatch {
  return { id, player1Id, player2Id, groupId: 'A' }
}

describe('recordResult', () => {
  it('records a winner and losing balls without changing the fixture', () => {
    const fixture = match('1', 'rui', 'sara')
    expect(recordResult(fixture, 'rui', 4)).toEqual({
      ...fixture,
      result: { winnerId: 'rui', loserBallsRemaining: 4, kind: 'played' },
    })
    expect(fixture.result).toBeUndefined()
  })

  it('records all seven balls remaining for a withdrawal', () => {
    expect(recordResult(match('1', 'rui', 'sara'), 'rui', 2, 'withdrawal').result).toEqual({
      winnerId: 'rui', loserBallsRemaining: ALL_BALLS_REMAINING, kind: 'withdrawal',
    })
    expect(ALL_BALLS_REMAINING).toBe(7)
  })

  it('rejects a winner outside the match and an invalid ball count', () => {
    const fixture = match('1', 'rui', 'sara')
    expect(() => recordResult(fixture, 'ana', 2)).toThrow()
    expect(() => recordResult(fixture, 'rui', -1)).toThrow()
    expect(() => recordResult(fixture, 'rui', 8)).toThrow()
    expect(() => recordResult(fixture, 'rui', 1.5)).toThrow()
  })
})

describe('calculateStandings', () => {
  it('awards three points to a winner and counts the loser\'s balls', () => {
    expect(calculateStandings(['rui', 'sara'], [recordResult(match('1', 'rui', 'sara'), 'rui', 4)])).toMatchObject([
      { playerId: 'rui', points: 3, ballsLeft: 0, rank: 1, requiresDraw: false },
      { playerId: 'sara', points: 0, ballsLeft: 4, rank: 2, requiresDraw: false },
    ])
  })

  it('orders equal points by fewer balls left before head-to-head', () => {
    const result = calculateStandings(['rui', 'sara', 'ana', 'leo'], [
      recordResult(match('1', 'rui', 'ana'), 'rui', 0),
      recordResult(match('2', 'sara', 'ana'), 'sara', 0),
      recordResult(match('3', 'leo', 'rui'), 'leo', 4),
      recordResult(match('4', 'leo', 'sara'), 'leo', 2),
    ])
    expect(result.map(({ playerId, rank }) => [playerId, rank])).toEqual([
      ['leo', 1], ['sara', 2], ['rui', 3], ['ana', 4],
    ])
  })

  it('uses the direct result when points and balls are equal', () => {
    const result = calculateStandings(['rui', 'sara', 'ana', 'leo'], [
      recordResult(match('1', 'rui', 'sara'), 'rui', 2),
      recordResult(match('2', 'ana', 'rui'), 'ana', 2),
      recordResult(match('3', 'sara', 'leo'), 'sara', 0),
    ])
    expect(result.map(({ playerId, rank }) => [playerId, rank])).toEqual([
      ['ana', 1], ['rui', 2], ['sara', 3], ['leo', 4],
    ])
    expect(result[1].headToHeadResult).toBe(3)
    expect(result[2].headToHeadResult).toBe(0)
  })

  it('leaves an unresolved final tie for an explicit draw', () => {
    expect(calculateStandings(['rui', 'sara'], [])).toMatchObject([
      { playerId: 'rui', rank: 1, headToHeadResult: null, requiresDraw: true },
      { playerId: 'sara', rank: 1, headToHeadResult: null, requiresDraw: true },
    ])
  })

  it('keeps a circular head-to-head tie unresolved', () => {
    expect(calculateStandings(['rui', 'sara', 'ana'], [
      recordResult(match('1', 'rui', 'sara'), 'rui', 2),
      recordResult(match('2', 'sara', 'ana'), 'sara', 2),
      recordResult(match('3', 'ana', 'rui'), 'ana', 2),
    ])).toMatchObject([
      { rank: 1, headToHeadResult: 3, requiresDraw: true },
      { rank: 1, headToHeadResult: 3, requiresDraw: true },
      { rank: 1, headToHeadResult: 3, requiresDraw: true },
    ])
  })

  it('ignores matches outside the supplied player group', () => {
    expect(calculateStandings(['rui', 'sara'], [
      recordResult(match('1', 'rui', 'ana'), 'rui', 4),
    ])).toMatchObject([
      { playerId: 'rui', points: 0, ballsLeft: 0, requiresDraw: true },
      { playerId: 'sara', points: 0, ballsLeft: 0, requiresDraw: true },
    ])
  })
})
