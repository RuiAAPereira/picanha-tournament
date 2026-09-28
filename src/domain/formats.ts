import type { PlayerId, TournamentMatch } from './types'

export type PreliminaryRound = {
  matchCount: number
  entrantsToDraw: number
  advancingCount: number
}

export type FormatProposal = {
  playerCount: number
  groupSize: number
  groupCount: number
  groupSizes: number[]
  knockoutSize: number
  preliminaryRound?: PreliminaryRound
  reason: string
  creationBlocked: boolean
}

export type DrawGroup = {
  id: string
  playerIds: PlayerId[]
  preliminaryWinnerMatchIds: string[]
}

export type DrawResult = {
  shuffledPlayerIds: PlayerId[]
  preliminaryPlayerIds: PlayerId[]
  preliminaryMatches: TournamentMatch[]
  groups: DrawGroup[]
}

function largestPowerOfTwoAtMost(value: number): number {
  let result = 1
  while (result * 2 <= value) result *= 2
  return result
}

function describeProposal(groupCount: number, groupSize: number, knockoutSize: number, matchCount: number): string {
  const groups = `${groupCount} grupo${groupCount === 1 ? '' : 's'} de ${groupSize}`
  const final = `fase final de ${knockoutSize}`
  if (matchCount === 0) return `${groups}, sem pré-eliminatória, com ${final}.`
  return `${groups}, após ${matchCount} pré-eliminatória${matchCount === 1 ? '' : 's'} com ${matchCount * 2} jogadores sorteados; ${matchCount} vencedor${matchCount === 1 ? '' : 'es'} avança${matchCount === 1 ? '' : 'm'} para os grupos, com ${final}.`
}

export function proposeFormats(playerCount: number, preferredGroupSize = 4): FormatProposal[] {
  if (!Number.isInteger(playerCount) || playerCount < 4 || playerCount > 32) {
    return [{
      playerCount, groupSize: 0, groupCount: 0, groupSizes: [], knockoutSize: 0,
      reason: 'O torneio requer 4 a 32 jogadores.', creationBlocked: true,
    }]
  }
  if (!Number.isInteger(preferredGroupSize) || preferredGroupSize < 3 || preferredGroupSize > 5) {
    throw new RangeError('O tamanho preferido do grupo tem de ser 3, 4 ou 5.')
  }

  const proposals: FormatProposal[] = []
  for (const groupSize of [3, 4, 5]) {
    for (let groupCount = 1; groupCount * groupSize <= playerCount; groupCount++) {
      const groupPlayers = groupCount * groupSize
      const matchCount = playerCount - groupPlayers
      if (matchCount * 2 > playerCount) continue
      const knockoutSize = largestPowerOfTwoAtMost(Math.min(groupCount * 2, groupPlayers))
      proposals.push({
        playerCount,
        groupSize,
        groupCount,
        groupSizes: Array(groupCount).fill(groupSize),
        knockoutSize,
        preliminaryRound: matchCount > 0
          ? { matchCount, entrantsToDraw: matchCount * 2, advancingCount: matchCount }
          : undefined,
        reason: `${groupSize === preferredGroupSize ? `A preferência por grupos de ${preferredGroupSize} favorece esta opção` : `Alternativa de grupos de ${groupSize}`}: ${describeProposal(groupCount, groupSize, knockoutSize, matchCount)}`,
        creationBlocked: false,
      })
    }
  }

  return proposals.sort((a, b) =>
    Math.abs(a.groupSize - preferredGroupSize) - Math.abs(b.groupSize - preferredGroupSize)
    || (a.preliminaryRound?.matchCount ?? 0) - (b.preliminaryRound?.matchCount ?? 0)
    || b.knockoutSize - a.knockoutSize
    || a.groupSize - b.groupSize)
}

export function drawGroups(playerIds: PlayerId[], proposal: FormatProposal, random: () => number): DrawResult {
  if (proposal.creationBlocked || playerIds.length !== proposal.playerCount) {
    throw new Error('O formato não corresponde aos jogadores inscritos.')
  }
  if (new Set(playerIds).size !== playerIds.length || playerIds.some(id => !id)) {
    throw new Error('Os jogadores têm de ter identificadores únicos.')
  }

  const shuffledPlayerIds = [...playerIds]
  for (let index = shuffledPlayerIds.length - 1; index > 0; index--) {
    const sample = random()
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError('A fonte do sorteio tem de produzir valores entre 0 e 1.')
    }
    const chosen = Math.floor(sample * (index + 1))
    ;[shuffledPlayerIds[index], shuffledPlayerIds[chosen]] = [shuffledPlayerIds[chosen], shuffledPlayerIds[index]]
  }

  const preliminaryCount = proposal.preliminaryRound?.matchCount ?? 0
  const preliminaryPlayerIds = shuffledPlayerIds.slice(0, preliminaryCount * 2)
  const preliminaryMatches: TournamentMatch[] = Array.from({ length: preliminaryCount }, (_, index) => ({
    id: `preliminary-${index + 1}`,
    player1Id: preliminaryPlayerIds[index * 2],
    player2Id: preliminaryPlayerIds[index * 2 + 1],
  }))
  const groups: DrawGroup[] = Array.from({ length: proposal.groupCount }, (_, index) => ({
    id: String.fromCharCode(65 + index),
    playerIds: [],
    preliminaryWinnerMatchIds: [],
  }))

  for (const [index, match] of preliminaryMatches.entries()) {
    groups[index % groups.length].preliminaryWinnerMatchIds.push(match.id)
  }
  for (const playerId of shuffledPlayerIds.slice(preliminaryCount * 2)) {
    const group = groups.find(candidate =>
      candidate.playerIds.length + candidate.preliminaryWinnerMatchIds.length < proposal.groupSize)
    if (!group) throw new Error('O formato não tem vagas suficientes para os jogadores.')
    group.playerIds.push(playerId)
  }

  return { shuffledPlayerIds, preliminaryPlayerIds, preliminaryMatches, groups }
}

export function createRoundRobinFixtures(groupId: string, playerIds: PlayerId[]): TournamentMatch[] {
  if (!groupId || playerIds.length < 2 || new Set(playerIds).size !== playerIds.length || playerIds.some(id => !id)) {
    throw new Error('O grupo requer jogadores com identificadores únicos.')
  }
  const fixtures: TournamentMatch[] = []
  for (let first = 0; first < playerIds.length; first++) {
    for (let second = first + 1; second < playerIds.length; second++) {
      fixtures.push({
        id: `group-${groupId}-${first + 1}-${second + 1}`,
        groupId,
        player1Id: playerIds[first],
        player2Id: playerIds[second],
      })
    }
  }
  return fixtures
}
