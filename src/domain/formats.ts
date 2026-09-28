import type { PlayerId, TournamentMatch } from './types'

export type PreliminaryRound = {
  matchCount: number
  entrantsToDraw: number
  advancingCount: number
}

export type Qualification = {
  perGroup: number
  bestPlacedExtras: number
  extrasFromRank?: number
}

export type FormatProposal = {
  playerCount: number
  groupSize: number
  groupCount: number
  groupSizes: number[]
  knockoutSize: number
  qualification: Qualification
  preliminaryRound?: PreliminaryRound
  reason: string
  creationBlocked: boolean
}

type Proposal = Omit<FormatProposal, 'reason'>

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

function describeQualification(groupCount: number, { perGroup, bestPlacedExtras }: Qualification): string {
  if (groupCount === 1) return 'final entre o 1.º e o 2.º classificados'
  if (bestPlacedExtras === 0) return `apuram-se os ${perGroup} primeiros de cada grupo`
  if (bestPlacedExtras === 1) return 'apuram-se os vencedores dos grupos e o melhor segundo classificado'
  return `apuram-se os vencedores dos grupos e os ${bestPlacedExtras} melhores segundos classificados`
}

function describeProposal(p: Proposal): string {
  const matchCount = p.preliminaryRound?.matchCount ?? 0
  const groups = `${p.groupCount} grupo${p.groupCount === 1 ? '' : 's'} de ${p.groupSize}`
  const final = `fase final de ${p.knockoutSize} (${describeQualification(p.groupCount, p.qualification)})`
  if (matchCount === 0) return `${groups}, sem pré-eliminatória, com ${final}.`
  return `${groups}, após ${matchCount} pré-eliminatória${matchCount === 1 ? '' : 's'} com ${matchCount * 2} jogadores sorteados; ${matchCount} vencedor${matchCount === 1 ? '' : 'es'} avança${matchCount === 1 ? '' : 'm'} para os grupos, com ${final}.`
}

function describeReason(p: Proposal, top: Proposal, index: number, preferredGroupSize: number): string {
  const matchCount = p.preliminaryRound?.matchCount ?? 0
  if (index === 0) {
    const why = [
      matchCount === 0 ? 'sem pré-eliminatória' : 'menor número de pré-eliminatórias',
      p.groupSize === preferredGroupSize ? `grupos de ${p.groupSize}` : `grupos de ${p.groupSize}, os mais próximos da preferência`,
    ]
    return `Recomendado (${why.join(', ')}): ${describeProposal(p)}`
  }
  const topMatches = top.preliminaryRound?.matchCount ?? 0
  const diffs: string[] = []
  if (p.groupSize !== top.groupSize) diffs.push(`grupos de ${p.groupSize} em vez de ${top.groupSize}`)
  else if (p.groupCount !== top.groupCount) diffs.push(`${p.groupCount} grupos em vez de ${top.groupCount}`)
  if (topMatches === 0 && matchCount > 0) diffs.push('exige pré-eliminatória')
  else if (matchCount > topMatches) diffs.push(`+${matchCount - topMatches} pré-eliminatória${matchCount - topMatches === 1 ? '' : 's'}`)
  else if (matchCount < topMatches) diffs.push(`${topMatches - matchCount} pré-eliminatória${topMatches - matchCount === 1 ? '' : 's'} a menos`)
  if (p.knockoutSize !== top.knockoutSize) diffs.push(`fase final de ${p.knockoutSize} em vez de ${top.knockoutSize}`)
  return `Alternativa (${diffs.join(', ') || 'diferente da recomendada'}): ${describeProposal(p)}`
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const sample = random()
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError('A fonte do sorteio tem de produzir valores entre 0 e 1.')
    }
    const chosen = Math.floor(sample * (index + 1))
    ;[result[index], result[chosen]] = [result[chosen], result[index]]
  }
  return result
}

export function proposeFormats(playerCount: number, preferredGroupSize = 4): FormatProposal[] {
  if (!Number.isInteger(playerCount) || playerCount < 4 || playerCount > 32) {
    return [{
      playerCount, groupSize: 0, groupCount: 0, groupSizes: [], knockoutSize: 0,
      qualification: { perGroup: 0, bestPlacedExtras: 0 },
      reason: 'O torneio requer 4 a 32 jogadores.', creationBlocked: true,
    }]
  }
  if (!Number.isInteger(preferredGroupSize) || preferredGroupSize < 3 || preferredGroupSize > 5) {
    throw new RangeError('O tamanho preferido do grupo tem de ser 3, 4 ou 5.')
  }

  const proposals: Proposal[] = []
  for (const groupSize of [3, 4, 5]) {
    for (let groupCount = 1; groupCount * groupSize <= playerCount; groupCount++) {
      const matchCount = playerCount - groupCount * groupSize
      // each group receives at most one preliminary winner
      if (matchCount * 2 > playerCount || matchCount > groupCount) continue
      const knockoutSize = largestPowerOfTwoAtMost(groupCount * 2)
      const qualification: Qualification = knockoutSize === groupCount * 2
        ? { perGroup: 2, bestPlacedExtras: 0 }
        : { perGroup: 1, bestPlacedExtras: knockoutSize - groupCount, extrasFromRank: 2 }
      proposals.push({
        playerCount,
        groupSize,
        groupCount,
        groupSizes: Array(groupCount).fill(groupSize),
        knockoutSize,
        qualification,
        preliminaryRound: matchCount > 0
          ? { matchCount, entrantsToDraw: matchCount * 2, advancingCount: matchCount }
          : undefined,
        creationBlocked: false,
      })
    }
  }

  const matches = (proposal: Proposal) => proposal.preliminaryRound?.matchCount ?? 0
  proposals.sort((a, b) =>
    Number(matches(a) > 0) - Number(matches(b) > 0)
    || Math.abs(a.groupSize - preferredGroupSize) - Math.abs(b.groupSize - preferredGroupSize)
    || matches(a) - matches(b)
    || b.knockoutSize - a.knockoutSize
    || a.groupSize - b.groupSize) // deterministic final tie-break

  return proposals.map((proposal, index) => ({
    ...proposal,
    reason: describeReason(proposal, proposals[0], index, preferredGroupSize),
  }))
}

export function drawGroups(playerIds: PlayerId[], proposal: FormatProposal, random: () => number): DrawResult {
  if (proposal.creationBlocked || playerIds.length !== proposal.playerCount) {
    throw new Error('O formato não corresponde aos jogadores inscritos.')
  }
  if (new Set(playerIds).size !== playerIds.length || playerIds.some(id => !id)) {
    throw new Error('Os jogadores têm de ter identificadores únicos.')
  }

  const shuffledPlayerIds = shuffle(playerIds, random)

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

  const winnerSlotOrder = preliminaryCount > 0 ? shuffle(groups.map((_, index) => index), random) : []
  for (const [index, match] of preliminaryMatches.entries()) {
    groups[winnerSlotOrder[index % groups.length]].preliminaryWinnerMatchIds.push(match.id)
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
