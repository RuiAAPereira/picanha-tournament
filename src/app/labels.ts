import type { KnockoutMatch, Slot } from '../domain/bracket'
import { findMatch, isKnockoutMatch, type TournamentState } from '../domain/tournament'
import type { MatchId, MatchResult, PlayerId, TournamentMatch } from '../domain/types'

const ROUND_NAMES = ['Final', 'Meias-finais', 'Quartos-de-final', 'Oitavos-de-final']

export const playerName = (state: TournamentState, playerId: PlayerId) =>
  state.players.find(player => player.id === playerId)?.displayName ?? playerId

/** The final's winner, once the final has a result; the tournament is finished then. */
export const championId = (state: TournamentState): PlayerId | null =>
  state.bracket.rounds.at(-1)?.matches[0]?.result?.winnerId ?? null

export function roundName(state: TournamentState, round: number): string {
  return ROUND_NAMES[state.bracket.rounds.length - round] ?? `Ronda ${round}`
}

const positionInRound = (state: TournamentState, match: KnockoutMatch) =>
  state.bracket.rounds[match.round - 1].matches.findIndex(candidate => candidate.id === match.id) + 1

export function knockoutMatchName(state: TournamentState, match: KnockoutMatch): string {
  const round = roundName(state, match.round)
  return state.bracket.rounds[match.round - 1].matches.length === 1 ? round : `${round}, jogo ${positionInRound(state, match)}`
}

export const preliminaryName = (state: TournamentState, matchId: MatchId) =>
  `Pré-eliminatória ${state.preliminaryMatches.findIndex(match => match.id === matchId) + 1}`

/** An unresolved knockout place, in words. Away crossings take a runner-up or a group winner depending on results. */
export function slotLabel(state: TournamentState, slot: Slot): string {
  switch (slot.type) {
    case 'group': return `${slot.rank}.º Grupo ${slot.group}`
    case 'crossing': return slot.side === 'home' ? '1.º de grupo' : 'Melhor 2.º ou 1.º de grupo'
    case 'winner': {
      const source = findMatch(state, slot.matchId) as KnockoutMatch
      return `Vencedor do jogo ${positionInRound(state, source)} (${roundName(state, source.round)})`
    }
  }
}

/** The two sides of a match: players when known, otherwise the places they come from. */
export function matchSides(state: TournamentState, match: TournamentMatch | KnockoutMatch): [string, string] {
  if (!isKnockoutMatch(match)) return [playerName(state, match.player1Id), playerName(state, match.player2Id)]
  return [
    match.homePlayerId ? playerName(state, match.homePlayerId) : slotLabel(state, match.home),
    match.awayPlayerId ? playerName(state, match.awayPlayerId) : slotLabel(state, match.away),
  ]
}

export const sidesText = (state: TournamentState, match: TournamentMatch | KnockoutMatch) =>
  matchSides(state, match).join(' contra ')

/** Where a match belongs and who plays it, e.g. `Grupo A: Ana contra Rui` or `Final: Ana contra Rui`. */
export function matchLabel(state: TournamentState, matchId: MatchId): string {
  const match = findMatch(state, matchId)
  if (!match) return matchId
  const place = isKnockoutMatch(match)
    ? knockoutMatchName(state, match)
    : match.groupId ? `Grupo ${match.groupId}` : preliminaryName(state, match.id)
  return `${place}: ${sidesText(state, match)}`
}

export function resultText(state: TournamentState, match: TournamentMatch | KnockoutMatch, result: MatchResult): string {
  const ids = isKnockoutMatch(match) ? [match.homePlayerId, match.awayPlayerId] : [match.player1Id, match.player2Id]
  const loserId = ids.find(id => id && id !== result.winnerId) ?? ''
  const winner = playerName(state, result.winnerId)
  const loser = playerName(state, loserId)
  if (result.kind === 'withdrawal') return `${winner} venceu por desistência de ${loser}`
  const balls = result.loserBallsRemaining
  return `${winner} venceu; ${loser} deixou ${balls} ${balls === 1 ? 'bola' : 'bolas'}`
}

/** A group's entrants as drawn; a preliminary slot shows its winner once decided. */
export function groupEntrants(state: TournamentState, groupId: string): string[] {
  const drawn = state.draw.groups.find(group => group.id === groupId)
  if (!drawn) return []
  return [
    ...drawn.playerIds.map(id => playerName(state, id)),
    ...drawn.preliminaryWinnerMatchIds.map(matchId => {
      const winnerId = state.preliminaryMatches.find(match => match.id === matchId)?.result?.winnerId
      return winnerId ? playerName(state, winnerId) : `Vencedor da ${preliminaryName(state, matchId)}`
    }),
  ]
}
