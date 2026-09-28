export type PlayerId = string
export type MatchId = string

export type MatchResult = {
  winnerId: PlayerId
  loserBallsRemaining: number
  kind: 'played' | 'withdrawal'
}

export type TournamentMatch = {
  id: MatchId
  player1Id: PlayerId
  player2Id: PlayerId
  groupId?: string
  result?: MatchResult
}

export type GroupStanding = {
  playerId: PlayerId
  points: number
  ballsLeft: number
  headToHeadResult: number | null
  rank: number
  requiresDraw: boolean
}
