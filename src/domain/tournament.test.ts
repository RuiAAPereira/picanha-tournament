import { describe, expect, it } from 'vitest'
import { proposeFormats, type DrawResult, type ReadyProposal } from './formats'
import {
  applyMatchResult, correctionImpact, correctMatchResult, createTournamentState, groupStandings, resolveTieDraw,
  type ResultInput, type TournamentState,
} from './tournament'
import type { MatchId, PlayerId } from './types'

const AT = '2026-09-28T10:00:00.000Z'
const LATER = '2026-09-28T11:00:00.000Z'

function readyProposal(playerCount: number, groupSize: number, groupCount: number): ReadyProposal {
  const proposal = proposeFormats(playerCount, groupSize).find(candidate =>
    !candidate.creationBlocked && candidate.groupSize === groupSize && candidate.groupCount === groupCount)
  if (!proposal || proposal.creationBlocked) throw new Error('test format missing')
  return proposal
}

function drawOf(groups: string[][], preliminary: [PlayerId, PlayerId][] = [], winnerSlots: string[] = []): DrawResult {
  return {
    shuffledPlayerIds: [...preliminary.flat(), ...groups.flat()],
    preliminaryPlayerIds: preliminary.flat(),
    preliminaryMatches: preliminary.map(([player1Id, player2Id], index) =>
      ({ id: `preliminary-${index + 1}`, player1Id, player2Id })),
    groups: groups.map((playerIds, index) => {
      const id = String.fromCharCode(65 + index)
      const slot = winnerSlots.indexOf(id)
      return { id, playerIds, preliminaryWinnerMatchIds: slot >= 0 ? [`preliminary-${slot + 1}`] : [] }
    }),
  }
}

function create(proposal: ReadyProposal, draw: DrawResult): TournamentState {
  const ids = [...draw.preliminaryPlayerIds, ...draw.groups.flatMap(group => group.playerIds)]
  return createTournamentState({
    id: 't1',
    name: 'Torneio da Picanha',
    players: ids.map(id => ({ id, displayName: id.toUpperCase() })),
    proposal,
    draw,
    createdAt: AT,
  })
}

const input = (matchId: MatchId, winnerId: PlayerId, loserBallsRemaining = 0, at = AT): ResultInput =>
  ({ matchId, winnerId, loserBallsRemaining, at })
const play = (state: TournamentState, matchId: MatchId, winnerId: PlayerId, balls = 0) =>
  applyMatchResult(state, input(matchId, winnerId, balls))

const groupOf = (state: TournamentState, id: string) => state.groups.find(group => group.id === id)!
const knockout = (state: TournamentState, id: MatchId) =>
  state.bracket.rounds.flatMap(round => round.matches).find(match => match.id === id)!

/** Plays every group match so the group finishes in the given order. */
function playGroup(state: TournamentState, groupId: string, order: PlayerId[]): TournamentState {
  return groupOf(state, groupId).matches.reduce((next, match) =>
    play(next, match.id, order.indexOf(match.player1Id) < order.indexOf(match.player2Id) ? match.player1Id : match.player2Id), state)
}

function fixtureId(state: TournamentState, groupId: string, first: PlayerId, second: PlayerId): MatchId {
  return groupOf(state, groupId).matches.find(match =>
    [match.player1Id, match.player2Id].sort().join() === [first, second].sort().join())!.id
}

const results = (state: TournamentState) => new Map([
  ...state.preliminaryMatches,
  ...state.groups.flatMap(group => group.matches),
  ...state.bracket.rounds.flatMap(round => round.matches),
].map(match => [match.id, match.result] as const))

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

const twoGroups = () => create(readyProposal(8, 4, 2), drawOf([['a1', 'a2', 'a3', 'a4'], ['b1', 'b2', 'b3', 'b4']]))
const groupsFinished = () =>
  playGroup(playGroup(twoGroups(), 'A', ['a1', 'a2', 'a3', 'a4']), 'B', ['b1', 'b2', 'b3', 'b4'])

describe('createTournamentState', () => {
  it('creates fixtures for complete groups and an empty bracket', () => {
    const state = twoGroups()
    expect(state).toMatchObject({ id: 't1', name: 'Torneio da Picanha', createdAt: AT, tieDraws: [], auditLog: [] })
    expect(groupOf(state, 'A').matches).toHaveLength(6)
    expect(state.bracket.rounds.map(round => round.matches.map(match => match.id)))
      .toEqual([['knockout-1-1', 'knockout-1-2'], ['knockout-2-1']])
    expect(state.bracket.rounds.flatMap(round => round.matches)
      .every(match => match.homePlayerId === null && match.awayPlayerId === null)).toBe(true)
  })

  it('creates a group with a preliminary slot only after its preliminary is decided', () => {
    const state = create(readyProposal(9, 4, 2),
      drawOf([['a1', 'a2', 'a3'], ['b1', 'b2', 'b3', 'b4']], [['p1', 'p2']], ['A']))
    expect(groupOf(state, 'A')).toMatchObject({ playerIds: ['a1', 'a2', 'a3'], matches: [] })
    expect(groupOf(state, 'B').matches).toHaveLength(6)

    const decided = play(state, 'preliminary-1', 'p2', 3)
    expect(groupOf(decided, 'A').playerIds).toEqual(['a1', 'a2', 'a3', 'p2'])
    expect(groupOf(decided, 'A').matches).toHaveLength(6)
  })

  it('rejects a draw that does not match the players or the format', () => {
    const proposal = readyProposal(8, 4, 2)
    expect(() => create(proposal, drawOf([['a1', 'a2', 'a3', 'a4']]))).toThrow(/sorteio/i)
    expect(() => createTournamentState({
      id: 't1', name: 'X', players: [], proposal, createdAt: AT,
      draw: drawOf([['a1', 'a2', 'a3', 'a4'], ['b1', 'b2', 'b3', 'b4']]),
    })).toThrow(/jogadores/i)
  })
})

describe('applyMatchResult', () => {
  it('fills knockout slots as groups finish and advances winners', () => {
    const onlyA = playGroup(twoGroups(), 'A', ['a1', 'a2', 'a3', 'a4'])
    expect(knockout(onlyA, 'knockout-1-1')).toMatchObject({ homePlayerId: 'a1', awayPlayerId: null })

    const state = groupsFinished()
    expect(knockout(state, 'knockout-1-1')).toMatchObject({ homePlayerId: 'a1', awayPlayerId: 'b2' })
    expect(knockout(state, 'knockout-1-2')).toMatchObject({ homePlayerId: 'b1', awayPlayerId: 'a2' })
    const semi = play(state, 'knockout-1-1', 'b2', 2)
    expect(knockout(semi, 'knockout-2-1')).toMatchObject({ homePlayerId: 'b2', awayPlayerId: null })
  })

  it('blocks results for unresolved slots, unknown matches, repeated results and invalid scores', () => {
    const state = twoGroups()
    expect(() => play(state, 'knockout-1-1', 'a1')).toThrow(/jogadores definidos/i)
    expect(() => play(state, 'nope', 'a1')).toThrow(/não existe/i)
    const matchId = fixtureId(state, 'A', 'a1', 'a2')
    const played = play(state, matchId, 'a1')
    expect(() => play(played, matchId, 'a2')).toThrow(/correção/i)
    expect(() => play(state, matchId, 'b1')).toThrow(/vencedor/i)
    expect(() => play(state, matchId, 'a1', 8)).toThrow(/bolas/i)
  })

  it('records a withdrawal with all balls remaining', () => {
    const state = twoGroups()
    const matchId = fixtureId(state, 'A', 'a1', 'a2')
    const next = applyMatchResult(state, { ...input(matchId, 'a1', 2), kind: 'withdrawal' })
    expect(groupOf(next, 'A').matches.find(match => match.id === matchId)!.result)
      .toEqual({ winnerId: 'a1', loserBallsRemaining: 7, kind: 'withdrawal' })
  })
})

describe('resolveTieDraw', () => {
  const cycle = () => withTieDrawn(false)

  it('keeps tied slots empty until the draw and records it in the audit log', () => {
    const tied = cycle()
    expect(groupStandings(tied, 'A').filter(row => row.requiresDraw)).toHaveLength(3)
    expect(knockout(tied, 'knockout-1-1').homePlayerId).toBeNull()
    expect(knockout(tied, 'knockout-1-2').awayPlayerId).toBeNull()

    const drawn = resolveTieDraw(tied, { type: 'group', groupId: 'A' }, () => 0.5, LATER)
    const [first, second, third] = groupStandings(drawn, 'A')
    expect([first, second, third].map(row => [row.rank, row.requiresDraw])).toEqual([[1, false], [2, false], [3, false]])
    expect([first, second, third].map(row => row.playerId).sort()).toEqual(['a1', 'a2', 'a3'])
    expect(knockout(drawn, 'knockout-1-1').homePlayerId).toBe(first.playerId)
    expect(knockout(drawn, 'knockout-1-2').awayPlayerId).toBe(second.playerId)
    expect(drawn.auditLog).toEqual([{
      type: 'tieDraw', at: LATER, scope: { type: 'group', groupId: 'A' },
      playerIds: [first.playerId, second.playerId, third.playerId],
    }])
  })

  it('refuses a draw without a pending tie or before the group finishes', () => {
    expect(() => resolveTieDraw(groupsFinished(), { type: 'group', groupId: 'A' }, () => 0, AT)).toThrow(/empate/i)
    expect(() => resolveTieDraw(twoGroups(), { type: 'group', groupId: 'A' }, () => 0, AT)).toThrow(/terminou/i)
    expect(() => resolveTieDraw(cycle(), { type: 'group', groupId: 'A' }, () => 1, AT)).toThrow(/sorteio/i)
  })

  it('draws tied best-placed runners-up and never crosses a runner-up with its own winner', () => {
    let state = create(readyProposal(9, 3, 3), drawOf([['a1', 'a2', 'a3'], ['b1', 'b2', 'b3'], ['c1', 'c2', 'c3']]))
    for (const group of ['A', 'B', 'C']) {
      const id = group.toLowerCase()
      state = playGroup(state, group, [`${id}1`, `${id}2`, `${id}3`])
    }
    expect(state.bracket.rounds[0].matches.every(match => !match.homePlayerId && !match.awayPlayerId)).toBe(true)

    const drawn = resolveTieDraw(state, { type: 'runnersUp' }, () => 0, LATER)
    const event = drawn.auditLog.at(-1)
    expect(event).toMatchObject({ type: 'tieDraw', scope: { type: 'runnersUp' } })
    const best = event?.type === 'tieDraw' ? event.playerIds[0] : ''
    const pairs = drawn.bracket.rounds[0].matches.map(match => [match.homePlayerId, match.awayPlayerId])
    expect(pairs.flat()).toEqual(expect.arrayContaining(['a1', 'b1', 'c1', best]))
    expect(pairs.every(([home, away]) => home && away && home[0] !== away[0])).toBe(true)
  })
})

describe('corrections', () => {
  const withSemiFinal = () => play(groupsFinished(), 'knockout-1-1', 'a1', 1)

  it('needs no confirmation when no slot changes and updates only standings', () => {
    const state = withSemiFinal()
    const matchId = fixtureId(state, 'A', 'a3', 'a4')
    const correction = input(matchId, 'a4', 5, LATER)
    expect(correctionImpact(state, correction)).toEqual({ requiresConfirmation: false, invalidatedMatchIds: [] })

    const corrected = correctMatchResult(state, correction, false)
    expect(groupStandings(corrected, 'A').map(row => row.playerId)).toEqual(['a1', 'a2', 'a4', 'a3'])
    expect(corrected.bracket).toEqual(state.bracket)
    const before = results(state)
    const after = results(corrected)
    expect([...after].filter(([id, result]) => id !== matchId && result !== before.get(id))).toEqual([])
    expect(corrected.auditLog.at(-1)).toMatchObject({ type: 'correction', matchId, invalidatedMatchIds: [] })
  })

  it('requires confirmation when a completed semi-final loses a player', () => {
    const state = withSemiFinal()
    const groupMatchId = fixtureId(state, 'B', 'b2', 'b3')
    const correction = input(groupMatchId, 'b3', 2, LATER)
    expect(correctionImpact(state, correction)).toEqual({
      requiresConfirmation: true,
      invalidatedMatchIds: ['knockout-1-1', 'knockout-2-1'],
    })
    expect(() => correctMatchResult(state, correction, false)).toThrow(/confirmação/i)
  })

  it('clears exactly the invalidated results once confirmed and audits them', () => {
    const state = withSemiFinal()
    const groupMatchId = fixtureId(state, 'B', 'b2', 'b3')
    const correction = input(groupMatchId, 'b3', 2, LATER)
    const { invalidatedMatchIds } = correctionImpact(state, correction)
    const corrected = correctMatchResult(state, correction, true)

    const before = results(state)
    const cleared = [...results(corrected)].filter(([id, result]) => before.get(id) && !result).map(([id]) => id)
    expect(cleared).toEqual(invalidatedMatchIds.filter(id => before.get(id)))
    expect(cleared).toEqual(['knockout-1-1'])
    expect(knockout(corrected, 'knockout-1-1')).toMatchObject({ homePlayerId: 'a1', awayPlayerId: 'b3' })
    expect(knockout(corrected, 'knockout-1-2')).toEqual(knockout(state, 'knockout-1-2'))
    expect(corrected.auditLog.at(-1)).toEqual({
      type: 'correction', at: LATER, matchId: groupMatchId,
      previous: { winnerId: 'b2', loserBallsRemaining: 0, kind: 'played' },
      next: { winnerId: 'b3', loserBallsRemaining: 2, kind: 'played' },
      invalidatedMatchIds,
    })
  })

  it('invalidates the final when a semi-final winner changes', () => {
    let state = play(withSemiFinal(), 'knockout-1-2', 'b1', 3)
    state = play(state, 'knockout-2-1', 'a1', 0)
    const correction = input('knockout-1-1', 'b2', 4, LATER)
    expect(correctionImpact(state, correction)).toEqual({ requiresConfirmation: true, invalidatedMatchIds: ['knockout-2-1'] })
    const corrected = correctMatchResult(state, correction, true)
    expect(knockout(corrected, 'knockout-2-1')).toEqual({ ...knockout(state, 'knockout-2-1'), homePlayerId: 'b2', result: undefined })
    expect(knockout(corrected, 'knockout-2-1')).not.toHaveProperty('result')
  })

  it('invalidates played group matches of a replaced preliminary winner', () => {
    let state = create(readyProposal(9, 4, 2),
      drawOf([['a1', 'a2', 'a3'], ['b1', 'b2', 'b3', 'b4']], [['p1', 'p2']], ['A']))
    state = play(state, 'preliminary-1', 'p1', 3)
    const early = correctionImpact(state, input('preliminary-1', 'p2', 1, LATER))
    expect(early).toEqual({ requiresConfirmation: false, invalidatedMatchIds: [] })

    const withP1 = fixtureId(state, 'A', 'a1', 'p1')
    const withoutP1 = fixtureId(state, 'A', 'a1', 'a2')
    state = play(play(state, withP1, 'p1'), withoutP1, 'a1')
    const correction = input('preliminary-1', 'p2', 1, LATER)
    expect(correctionImpact(state, correction)).toEqual({ requiresConfirmation: true, invalidatedMatchIds: [withP1] })
    expect(() => correctMatchResult(state, correction, false)).toThrow(/confirmação/i)

    const corrected = correctMatchResult(state, correction, true)
    expect(groupOf(corrected, 'A').playerIds).toEqual(['a1', 'a2', 'a3', 'p2'])
    const matches = groupOf(corrected, 'A').matches
    expect(matches.find(match => match.id === withP1)).toEqual({ id: withP1, groupId: 'A', player1Id: 'a1', player2Id: 'p2' })
    expect(matches.find(match => match.id === withoutP1)?.result?.winnerId).toBe('a1')
  })

  it('rejects correcting a match without a result and ignores an identical correction', () => {
    const state = withSemiFinal()
    expect(() => correctMatchResult(state, input('knockout-1-2', 'b1', 0, LATER), false)).toThrow(/ainda não tem resultado/i)
    const same = input('knockout-1-1', 'a1', 1, LATER)
    expect(correctionImpact(state, same)).toEqual({ requiresConfirmation: false, invalidatedMatchIds: [] })
    expect(correctMatchResult(state, same, false)).toBe(state)
  })
})

describe('state purity', () => {
  it('survives a JSON round-trip mid-tournament', () => {
    const drawn = withTieDrawn()
    const state = correctMatchResult(drawn, input(fixtureId(drawn, 'B', 'b3', 'b4'), 'b3', 4, LATER), false)
    expect(state.auditLog.map(event => event.type)).toEqual(['tieDraw', 'correction'])
    expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state)
  })

  it('never mutates the input state', () => {
    const state = deepFreeze(play(groupsFinished(), 'knockout-1-1', 'a1', 1))
    const snapshot = JSON.stringify(state)
    play(state, 'knockout-1-2', 'b1')
    correctionImpact(state, input(fixtureId(state, 'B', 'b2', 'b3'), 'b3', 2, LATER))
    correctMatchResult(state, input(fixtureId(state, 'B', 'b2', 'b3'), 'b3', 2, LATER), true)
    correctMatchResult(state, input(fixtureId(state, 'B', 'b3', 'b4'), 'b3', 5, LATER), false)
    expect(JSON.stringify(state)).toBe(snapshot)

    const tied = deepFreeze(withTieDrawn(false))
    resolveTieDraw(tied, { type: 'group', groupId: 'A' }, () => 0.3, LATER)
  })
})

function withTieDrawn(drawn = true): TournamentState {
  let state = playGroup(twoGroups(), 'B', ['b1', 'b2', 'b3', 'b4'])
  for (const [winner, loser] of [['a1', 'a2'], ['a2', 'a3'], ['a3', 'a1'], ['a1', 'a4'], ['a2', 'a4'], ['a3', 'a4']]) {
    state = play(state, fixtureId(state, 'A', winner, loser), winner)
  }
  return drawn ? resolveTieDraw(state, { type: 'group', groupId: 'A' }, () => 0.7, LATER) : state
}
