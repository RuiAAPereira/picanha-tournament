import { describe, expect, it } from 'vitest'
import { championId, matchLabel, resultText } from '../app/labels'
import { applyMatchResult, isGroupFinished, pendingTieScopes, type TournamentState } from '../domain/tournament'
import { createDemoTournament, demoPresentationStates } from './seedTournament'

const AT = '2026-09-26T23:00:00.000Z'

/** Records a pending knockout match with the home player winning. */
function playHome(state: TournamentState, matchId: string): TournamentState {
  const match = state.bracket.rounds.flatMap(round => round.matches).find(candidate => candidate.id === matchId)!
  return applyMatchResult(state, { matchId, winnerId: match.homePlayerId!, loserBallsRemaining: 2, at: AT })
}

describe('createDemoTournament', () => {
  it('has 16 fictional players including Rui and is deterministic', () => {
    expect(createDemoTournament()).toMatchObject({
      players: expect.arrayContaining([expect.objectContaining({ displayName: 'Rui' })]),
    })
    expect(createDemoTournament().players).toHaveLength(16)
    expect(new Set(createDemoTournament().players.map(player => player.displayName)).size).toBe(16)
    expect(createDemoTournament()).toEqual(createDemoTournament())
  })

  it('has four finished groups of four with no tie to draw', () => {
    const state = createDemoTournament()
    expect(state.groups.map(group => group.playerIds.length)).toEqual([4, 4, 4, 4])
    expect(state.preliminaryMatches).toEqual([])
    for (const group of state.groups) {
      expect(group.matches).toHaveLength(6)
      expect(isGroupFinished(state, group.id)).toBe(true)
    }
    expect(pendingTieScopes(state)).toEqual([])
    expect(state.tieDraws).toEqual([])
  })

  it('has a valid eight-place bracket with one semi-final and the final still to play', () => {
    const state = createDemoTournament()
    const { rounds } = state.bracket
    expect(rounds.map(round => round.matches.length)).toEqual([4, 2, 1])
    const quarterFinalists = rounds[0].matches.flatMap(match => [match.homePlayerId, match.awayPlayerId])
    expect(quarterFinalists.every(id => id)).toBe(true)
    expect(new Set(quarterFinalists).size).toBe(8)
    expect(rounds[0].matches.every(match => match.result)).toBe(true)
    expect(rounds[1].matches.map(match => !!match.result)).toEqual([true, false])
    expect(rounds[1].matches[1].homePlayerId && rounds[1].matches[1].awayPlayerId).toBeTruthy()
    expect(rounds[2].matches[0].result).toBeUndefined()
    expect(championId(state)).toBeNull()
  })

  // Keep docs/manual-test-demo.md in sync with these names.
  it('has the knockout matches the manual script names', () => {
    const state = createDemoTournament()
    const [quarters, semis] = state.bracket.rounds.map(round => round.matches)
    const summary = (match: (typeof quarters)[number]) =>
      [matchLabel(state, match.id), match.result ? resultText(state, match, match.result) : 'por disputar']
    expect(summary(quarters[2])).toEqual(['Quartos-de-final, jogo 3: Carla contra Tiago', 'Carla venceu; Tiago deixou 4 bolas'])
    expect(summary(semis[0])).toEqual(['Meias-finais, jogo 1: Beatriz contra Nuno', 'Beatriz venceu; Nuno deixou 3 bolas'])
    expect(summary(semis[1])).toEqual(['Meias-finais, jogo 2: Carla contra Marta', 'por disputar'])
  })

  it('survives a JSON round-trip and reaches a champion within two results', () => {
    const state = createDemoTournament()
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
    const finished = playHome(playHome(state, 'knockout-2-2'), 'knockout-3-1')
    expect(championId(finished)).toBe(finished.bracket.rounds[2].matches[0].homePlayerId)
  })
})

describe('demoPresentationStates', () => {
  it('prepares a result and a champion for the TV, deterministically', () => {
    const { result, champion } = demoPresentationStates()
    expect(demoPresentationStates()).toEqual({ result, champion })
    expect(result).toMatchObject({ kind: 'result', tournamentName: 'Torneio de demonstração', payload: { stage: 'Meias-finais' } })
    expect(champion).toMatchObject({ kind: 'champion', tournamentName: 'Torneio de demonstração' })
    if (champion.kind !== 'champion') throw new Error('expected champion')
    const names = createDemoTournament().players.map(player => player.displayName)
    expect(names).toContain(champion.payload.champion)
    expect(names).toContain(champion.payload.runnerUp)
    expect(champion.payload.champion).not.toBe(champion.payload.runnerUp)
  })
})
