import { championId, matchSides, playerName, preliminaryName, roundName } from '../app/labels'
import { findMatch, isKnockoutMatch, type TournamentState } from '../domain/tournament'
import type { PlayerId } from '../domain/types'
import type { SessionEvent } from '../platform/presentationPort'
import type { DrawEntrant, PresentationState } from './presentationState'

const idle = (state: TournamentState): PresentationState =>
  ({ kind: 'idle', tournamentName: state.name, payload: null })

/** A group's entrants as drawn; an undecided preliminary winner is shortened for the TV, e.g. `Vencedor PE 3`. */
function drawEntrants(state: TournamentState, groupId: string): DrawEntrant[] {
  const drawn = state.draw.groups.find(group => group.id === groupId)
  if (!drawn) return []
  return [
    ...drawn.playerIds.map(id => ({ name: playerName(state, id) })),
    ...drawn.preliminaryWinnerMatchIds.map(matchId => {
      const index = state.preliminaryMatches.findIndex(match => match.id === matchId)
      const winnerId = state.preliminaryMatches[index]?.result?.winnerId
      if (winnerId) return { name: playerName(state, winnerId) }
      return { name: `Vencedor PE ${index + 1}`, description: `Vencedor da ${preliminaryName(state, matchId)}` }
    }),
  ]
}

function projectDraw(state: TournamentState): PresentationState {
  return {
    kind: 'draw',
    tournamentName: state.name,
    payload: {
      groups: state.draw.groups.map(group => ({ id: group.id, entrants: drawEntrants(state, group.id) })),
      preliminaryMatches: state.preliminaryMatches.map(match => ({
        label: preliminaryName(state, match.id),
        sides: matchSides(state, match),
      })),
    },
  }
}

function projectChampion(state: TournamentState, winnerId: PlayerId): PresentationState {
  const final = state.bracket.rounds.at(-1)!.matches[0]
  const runnerUpId = [final.homePlayerId, final.awayPlayerId].find(id => id && id !== winnerId) ?? ''
  return {
    kind: 'champion',
    tournamentName: state.name,
    payload: { champion: playerName(state, winnerId), runnerUp: playerName(state, runnerUpId) },
  }
}

function projectResult(state: TournamentState, event: SessionEvent): PresentationState {
  const match = event.matchId ? findMatch(state, event.matchId) : undefined
  const result = match?.result
  if (!match || !result) return idle(state)
  const knockout = isKnockoutMatch(match)
  const ids = knockout ? [match.homePlayerId, match.awayPlayerId] : [match.player1Id, match.player2Id]
  const loserId = ids.find(id => id && id !== result.winnerId) ?? ''
  return {
    kind: 'result',
    tournamentName: state.name,
    payload: {
      stage: knockout
        ? roundName(state, match.round)
        : match.groupId ? `Grupo ${match.groupId}` : preliminaryName(state, match.id),
      winner: playerName(state, result.winnerId),
      loser: playerName(state, loserId),
      loserBallsRemaining: result.loserBallsRemaining,
      withdrawal: result.kind === 'withdrawal',
      corrected: event.type === 'correction',
    },
  }
}

/** What the TV shows between changes, e.g. after the operator resumes a saved tournament: the champion or the name. */
export function projectResting(state: TournamentState): PresentationState {
  const champion = championId(state)
  return champion ? projectChampion(state, champion) : idle(state)
}

/** What the TV shows after a confirmed change: names and labels only, never the whole tournament. */
export function projectPresentation(state: TournamentState, event: SessionEvent): PresentationState {
  switch (event.type) {
    case 'draw': return projectDraw(state)
    case 'result':
    case 'correction': {
      // A decided final outshines the result that decided it.
      const champion = championId(state)
      return champion ? projectChampion(state, champion) : projectResult(state, event)
    }
    case 'tie':
    case 'demo': return idle(state)
  }
}
