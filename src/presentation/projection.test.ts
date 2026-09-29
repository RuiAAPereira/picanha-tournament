import { describe, expect, it } from 'vitest'
import { fourPlayerState, NOW, playGroups } from '../app/testSupport'
import { drawGroups, proposeFormats, type ReadyProposal } from '../domain/formats'
import { applyMatchResult, correctMatchResult, createTournamentState, type TournamentState } from '../domain/tournament'
import { projectPresentation } from './projection'

const ORDER = ['ana', 'bruno', 'carla', 'duarte']

function stateFor(names: string[], pick: (proposal: ReadyProposal) => boolean): TournamentState {
  const players = names.map(name => ({ id: name.toLowerCase(), displayName: name }))
  const proposal = proposeFormats(names.length).find(candidate => !candidate.creationBlocked && pick(candidate)) as ReadyProposal
  return createTournamentState({
    id: 't', name: 'Taça', players, proposal, createdAt: NOW,
    draw: drawGroups(players.map(player => player.id), proposal, () => 0),
  })
}

const sevenPlayers = () => stateFor(['Ana', 'Bruno', 'Carla', 'Duarte', 'Eva', 'Filipe', 'Gil'], p => !!p.preliminaryRound)

const play = (state: TournamentState, matchId: string, winnerId: string, loserBallsRemaining = 2, kind: 'played' | 'withdrawal' = 'played') =>
  applyMatchResult(state, { matchId, winnerId, loserBallsRemaining, kind, at: NOW })

describe('projectPresentation', () => {
  it('shows the draw as names, with preliminary winners as labelled placeholders', () => {
    const state = sevenPlayers()
    const projected = projectPresentation(state, { type: 'draw' })
    expect(projected.kind).toBe('draw')
    expect(projected.tournamentName).toBe('Taça')
    if (projected.kind !== 'draw') return
    const entrants = projected.payload.groups.flatMap(group => group.entrants)
    expect(entrants).toContain('Vencedor da Pré-eliminatória 1')
    expect(entrants.every(name => !/^[a-z]+$/.test(name))).toBe(true)
    expect(projected.payload.preliminaryMatches).toHaveLength(1)
    expect(projected.payload.preliminaryMatches[0].label).toBe('Pré-eliminatória 1')
    expect(projected.payload.preliminaryMatches[0].sides.every(name => /^[A-Z]/.test(name))).toBe(true)
  })

  it('shows a group result with the balls left in the plural', () => {
    const before = fourPlayerState()
    const match = before.groups[0].matches[0]
    const state = play(before, match.id, match.player1Id, 2)
    expect(projectPresentation(state, { type: 'result', matchId: match.id })).toEqual({
      kind: 'result',
      tournamentName: 'Torneio',
      payload: {
        stage: 'Grupo A',
        winner: state.players.find(player => player.id === match.player1Id)!.displayName,
        loser: state.players.find(player => player.id === match.player2Id)!.displayName,
        loserBallsRemaining: 2,
        withdrawal: false,
        corrected: false,
      },
    })
  })

  it('names preliminary and knockout stages', () => {
    const seven = sevenPlayers()
    const preliminary = seven.preliminaryMatches[0]
    const afterPreliminary = play(seven, preliminary.id, preliminary.player1Id, 1)
    expect(projectPresentation(afterPreliminary, { type: 'result', matchId: preliminary.id }))
      .toMatchObject({ kind: 'result', payload: { stage: 'Pré-eliminatória 1', loserBallsRemaining: 1 } })

    const eight = playGroups(
      stateFor(['Ana', 'Bruno', 'Carla', 'Duarte', 'Eva', 'Filipe', 'Gil', 'Hugo'], p => p.groupCount === 2 && p.groupSize === 4),
      ['ana', 'bruno', 'carla', 'duarte', 'eva', 'filipe', 'gil', 'hugo'],
    )
    const semi = eight.bracket.rounds[0].matches[0]
    const afterSemi = play(eight, semi.id, semi.homePlayerId!, 3)
    expect(projectPresentation(afterSemi, { type: 'result', matchId: semi.id }))
      .toMatchObject({ kind: 'result', payload: { stage: 'Meias-finais', loserBallsRemaining: 3 } })
  })

  it('marks withdrawals and corrections', () => {
    const before = fourPlayerState()
    const match = before.groups[0].matches[0]
    const withdrawn = play(before, match.id, match.player1Id, 0, 'withdrawal')
    expect(projectPresentation(withdrawn, { type: 'result', matchId: match.id }))
      .toMatchObject({ payload: { withdrawal: true, corrected: false } })

    const corrected = correctMatchResult(withdrawn, {
      matchId: match.id, winnerId: match.player2Id, loserBallsRemaining: 1, kind: 'played', at: NOW,
    }, true)
    expect(projectPresentation(corrected, { type: 'correction', matchId: match.id })).toMatchObject({
      kind: 'result',
      payload: {
        winner: corrected.players.find(player => player.id === match.player2Id)!.displayName,
        loserBallsRemaining: 1, withdrawal: false, corrected: true,
      },
    })
  })

  it('crowns the champion once the final has a result', () => {
    const groupsDone = playGroups(fourPlayerState(), ORDER)
    const final = groupsDone.bracket.rounds.at(-1)!.matches[0]
    const finished = play(groupsDone, final.id, 'bruno', 1)
    expect(projectPresentation(finished, { type: 'result', matchId: final.id })).toEqual({
      kind: 'champion', tournamentName: 'Torneio', payload: { champion: 'Bruno', runnerUp: 'Ana' },
    })
  })

  it('stays idle for tie draws, the demonstration and results it cannot find', () => {
    const state = fourPlayerState()
    const idle = { kind: 'idle', tournamentName: 'Torneio', payload: null }
    expect(projectPresentation(state, { type: 'tie' })).toEqual(idle)
    expect(projectPresentation(state, { type: 'demo' })).toEqual(idle)
    expect(projectPresentation(state, { type: 'result', matchId: 'nenhum' })).toEqual(idle)
    expect(projectPresentation(state, { type: 'result', matchId: state.groups[0].matches[0].id })).toEqual(idle)
  })
})
