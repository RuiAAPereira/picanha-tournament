import type { GroupStanding, PlayerId, TournamentMatch } from './types'

export const ALL_BALLS_REMAINING = 7

export function recordResult(
  match: TournamentMatch,
  winnerId: PlayerId,
  loserBallsRemaining: number,
  kind: 'played' | 'withdrawal' = 'played',
): TournamentMatch {
  if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
    throw new Error('Winner must be a player in the match')
  }
  if (kind === 'played' && (
    !Number.isInteger(loserBallsRemaining)
    || loserBallsRemaining < 0
    || loserBallsRemaining > ALL_BALLS_REMAINING
  )) {
    throw new Error(`Remaining balls must be an integer from 0 to ${ALL_BALLS_REMAINING}`)
  }

  return {
    ...match,
    result: {
      winnerId,
      loserBallsRemaining: kind === 'withdrawal' ? ALL_BALLS_REMAINING : loserBallsRemaining,
      kind,
    },
  }
}

export function calculateStandings(
  players: PlayerId[],
  matches: TournamentMatch[],
): GroupStanding[] {
  const playerSet = new Set(players)
  const completed = matches.filter(match =>
    match.result && playerSet.has(match.player1Id) && playerSet.has(match.player2Id),
  )
  const standings = players.map((playerId): GroupStanding => ({
    playerId,
    points: completed.reduce((total, match) =>
      total + (match.result?.winnerId === playerId ? 3 : 0), 0),
    ballsLeft: completed.reduce((total, match) =>
      total + (match.result && match.result.winnerId !== playerId
        && (match.player1Id === playerId || match.player2Id === playerId)
        ? match.result.loserBallsRemaining : 0), 0),
    headToHeadResult: null,
    rank: 0,
    requiresDraw: false,
  }))

  standings.sort((a, b) => b.points - a.points || a.ballsLeft - b.ballsLeft)

  for (let start = 0; start < standings.length;) {
    let end = start + 1
    while (end < standings.length
      && standings[end].points === standings[start].points
      && standings[end].ballsLeft === standings[start].ballsLeft) {
      end++
    }

    standings.splice(start, end - start, ...breakTie(standings.slice(start, end), completed, start + 1, true))
    start = end
  }

  return standings
}

/**
 * Orders players level on points and balls by their mini-table, then re-applies it to each part that
 * is still level (only their mutual matches). What no mini-table can split goes to a draw.
 * `headToHeadResult` keeps the mini-table of the outermost tie.
 */
function breakTie(cohort: GroupStanding[], completed: TournamentMatch[], rank: number, outermost: boolean): GroupStanding[] {
  const settle = (requiresDraw: boolean) => {
    for (const standing of cohort) {
      standing.rank = rank
      standing.requiresDraw = requiresDraw
    }
    return cohort
  }
  if (cohort.length === 1) return settle(false)

  const ids = new Set(cohort.map(standing => standing.playerId))
  const mutual = completed.filter(match => ids.has(match.player1Id) && ids.has(match.player2Id))
  const pairsComplete = cohort.every((standing, index) =>
    cohort.slice(index + 1).every(opponent =>
      mutual.some(match =>
        (match.player1Id === standing.playerId && match.player2Id === opponent.playerId)
        || (match.player2Id === standing.playerId && match.player1Id === opponent.playerId),
      ),
    ),
  )
  if (!pairsComplete) return settle(true)

  const score = new Map(cohort.map(standing => [standing.playerId,
    mutual.reduce((points, match) => points + (match.result?.winnerId === standing.playerId ? 3 : 0), 0)]))
  if (outermost) for (const standing of cohort) standing.headToHeadResult = score.get(standing.playerId)!

  const parts: GroupStanding[][] = []
  for (const standing of [...cohort].sort((a, b) => score.get(b.playerId)! - score.get(a.playerId)!)) {
    const last = parts.at(-1)
    if (last && score.get(last[0].playerId) === score.get(standing.playerId)) last.push(standing)
    else parts.push([standing])
  }
  if (parts.length === 1) return settle(true)

  const ordered: GroupStanding[] = []
  for (const part of parts) ordered.push(...breakTie(part, completed, rank + ordered.length, false))
  return ordered
}
