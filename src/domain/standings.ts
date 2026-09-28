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

    const cohort = standings.slice(start, end)
    if (cohort.length > 1) {
      const pairsComplete = cohort.every((standing, index) =>
        cohort.slice(index + 1).every(opponent =>
          completed.some(match =>
            (match.player1Id === standing.playerId && match.player2Id === opponent.playerId)
            || (match.player2Id === standing.playerId && match.player1Id === opponent.playerId),
          ),
        ),
      )
      if (pairsComplete) {
        const cohortIds = new Set(cohort.map(standing => standing.playerId))
        for (const standing of cohort) {
          standing.headToHeadResult = completed.reduce((points, match) =>
            points + (cohortIds.has(match.player1Id) && cohortIds.has(match.player2Id)
              && match.result?.winnerId === standing.playerId ? 3 : 0), 0)
        }
        cohort.sort((a, b) => (b.headToHeadResult ?? 0) - (a.headToHeadResult ?? 0))
        standings.splice(start, cohort.length, ...cohort)
      }
    }

    for (let index = start; index < end; index++) {
      const previous = index > start ? standings[index - 1] : null
      const tiedWithPrevious = previous?.headToHeadResult === standings[index].headToHeadResult
      const next = index + 1 < end ? standings[index + 1] : null
      const tiedWithNext = next?.headToHeadResult === standings[index].headToHeadResult
      standings[index].rank = tiedWithPrevious ? previous.rank : index + 1
      standings[index].requiresDraw = tiedWithPrevious || tiedWithNext
    }
    start = end
  }

  return standings
}
