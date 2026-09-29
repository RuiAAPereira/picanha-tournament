import type { PlayerId, TournamentMatch } from './types'

export type PreliminaryRound = {
  matchCount: number
  entrantsToDraw: number
  advancingCount: number
}

export type Qualification =
  | { perGroup: 2; bestPlacedExtras: 0 }
  | { perGroup: 1; bestPlacedExtras: number; extrasFromRank: 2 }

export type BlockedProposal = {
  creationBlocked: true
  playerCount: number
  reason: string
}

export type ReadyProposal = {
  creationBlocked: false
  playerCount: number
  groupSize: number
  groupCount: number
  groupSizes: number[]
  knockoutSize: number
  qualification: Qualification
  preliminaryRound?: PreliminaryRound
  reason: string
}

export type FormatProposal = BlockedProposal | ReadyProposal

type Candidate = Omit<ReadyProposal, 'reason'>

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

const matchesOf = (candidate: Candidate) => candidate.preliminaryRound?.matchCount ?? 0
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function largestPowerOfTwoAtMost(value: number): number {
  let result = 1
  while (result * 2 <= value) result *= 2
  return result
}

/** The single qualification rule: the largest power-of-two knockout that fits two qualifiers per group. */
export function qualificationFor(groupCount: number): { knockoutSize: number; qualification: Qualification } {
  if (!Number.isInteger(groupCount) || groupCount < 1) {
    throw new RangeError('O número de grupos tem de ser um inteiro positivo.')
  }
  const knockoutSize = largestPowerOfTwoAtMost(groupCount * 2)
  return {
    knockoutSize,
    qualification: knockoutSize === groupCount * 2
      ? { perGroup: 2, bestPlacedExtras: 0 }
      : { perGroup: 1, bestPlacedExtras: knockoutSize - groupCount, extrasFromRank: 2 },
  }
}

function describeFinal(candidate: Candidate): string {
  if (candidate.groupCount === 1) return 'final entre o 1.º e o 2.º classificados'
  const { qualification } = candidate
  switch (qualification.perGroup) {
    case 2:
      return `fase final de ${candidate.knockoutSize} (apuram-se os 2 primeiros de cada grupo)`
    case 1:
      return `fase final de ${candidate.knockoutSize} (${qualification.bestPlacedExtras === 1
        ? 'apuram-se os vencedores dos grupos e o melhor segundo classificado'
        : `apuram-se os vencedores dos grupos e os ${qualification.bestPlacedExtras} melhores segundos classificados`})`
  }
}

function describeBody(candidate: Candidate): string {
  const matchCount = matchesOf(candidate)
  const groups = plural(candidate.groupCount, 'grupo', 'grupos') + ` de ${candidate.groupSize}`
  const preliminary = matchCount === 0
    ? ''
    : `, após ${plural(matchCount, 'pré-eliminatória', 'pré-eliminatórias')} com ${matchCount * 2} jogadores sorteados; ${matchCount} vencedor${matchCount === 1 ? ' avança' : 'es avançam'} para ${candidate.groupCount === 1 ? 'o grupo' : 'os grupos'}`
  return `${groups}${preliminary}, com ${describeFinal(candidate)}.`
}

function describeWhyRecommended(top: Candidate, all: Candidate[], preferredGroupSize: number): string {
  const matchCount = matchesOf(top)
  const why: string[] = []
  if (matchCount === 0) {
    why.push('sem pré-eliminatória')
    if (top.groupSize !== preferredGroupSize && all.some(candidate => candidate.groupSize === preferredGroupSize)) {
      why.push(`grupos de ${preferredGroupSize} exigiriam pré-eliminatória`)
    }
  }
  if (top.groupSize === preferredGroupSize) why.push('tamanho de grupo preferido')
  else if (matchCount > 0) {
    // With a preferred size of 4, groups of 3 and 5 are equally close.
    const mirror = 2 * preferredGroupSize - top.groupSize
    why.push(mirror >= 3 && mirror <= 5
      ? 'um dos tamanhos de grupo mais próximos do preferido'
      : 'tamanho de grupo mais próximo do preferido')
  }
  if (matchCount > 0 && all.every(candidate => matchesOf(candidate) >= matchCount)) why.push('menor número de pré-eliminatórias')
  return why.join('; ')
}

function describeDifferences(candidate: Candidate, top: Candidate): string {
  const diffs: string[] = []
  if (candidate.groupSize !== top.groupSize) diffs.push(`grupos de ${candidate.groupSize} em vez de ${top.groupSize}`)
  if (candidate.groupCount !== top.groupCount) diffs.push(`${candidate.groupCount} grupos em vez de ${top.groupCount}`)
  const matchCount = matchesOf(candidate)
  const topMatches = matchesOf(top)
  if (topMatches === 0 && matchCount > 0) diffs.push(`exige ${plural(matchCount, 'pré-eliminatória', 'pré-eliminatórias')}`)
  else if (matchCount > topMatches) diffs.push(`mais ${plural(matchCount - topMatches, 'pré-eliminatória', 'pré-eliminatórias')}`)
  else if (matchCount < topMatches) diffs.push(`menos ${plural(topMatches - matchCount, 'pré-eliminatória', 'pré-eliminatórias')}`)
  if (candidate.knockoutSize !== top.knockoutSize) diffs.push(`fase final de ${candidate.knockoutSize} em vez de ${top.knockoutSize}`)
  return diffs.join(', ')
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
  // An unsupported player count is a normal situation the UI explains; an invalid preferred size is a programmer error.
  if (!Number.isInteger(playerCount) || playerCount < 4 || playerCount > 32) {
    return [{ creationBlocked: true, playerCount, reason: 'O torneio requer 4 a 32 jogadores.' }]
  }
  if (!Number.isInteger(preferredGroupSize) || preferredGroupSize < 3 || preferredGroupSize > 5) {
    throw new RangeError('O tamanho preferido do grupo tem de ser 3, 4 ou 5.')
  }

  const candidates: Candidate[] = []
  for (const groupSize of [3, 4, 5]) {
    for (let groupCount = 1; groupCount * groupSize <= playerCount; groupCount++) {
      const matchCount = playerCount - groupCount * groupSize
      // each group receives at most one preliminary winner
      if (matchCount > groupCount) continue
      candidates.push({
        creationBlocked: false,
        playerCount,
        groupSize,
        groupCount,
        groupSizes: Array(groupCount).fill(groupSize),
        ...qualificationFor(groupCount),
        preliminaryRound: matchCount > 0
          ? { matchCount, entrantsToDraw: matchCount * 2, advancingCount: matchCount }
          : undefined,
      })
    }
  }

  candidates.sort((a, b) =>
    Number(matchesOf(a) > 0) - Number(matchesOf(b) > 0)
    || Math.abs(a.groupSize - preferredGroupSize) - Math.abs(b.groupSize - preferredGroupSize)
    || matchesOf(a) - matchesOf(b)
    || b.knockoutSize - a.knockoutSize
    || a.groupSize - b.groupSize) // deterministic final tie-break

  const [top] = candidates
  return candidates.map((candidate, index) => ({
    ...candidate,
    reason: index === 0
      ? `Recomendado (${describeWhyRecommended(top, candidates, preferredGroupSize)}): ${describeBody(candidate)}`
      : `Alternativa (${describeDifferences(candidate, top)}): ${describeBody(candidate)}`,
  }))
}

export function drawGroups(playerIds: PlayerId[], proposal: FormatProposal, random: () => number): DrawResult {
  if (proposal.creationBlocked || playerIds.length !== proposal.playerCount) {
    throw new Error('O formato não corresponde aos jogadores inscritos.')
  }
  const preliminaryCount = proposal.preliminaryRound?.matchCount ?? 0
  if (
    !Number.isInteger(preliminaryCount) || preliminaryCount < 0 || preliminaryCount > proposal.groupCount
    || proposal.groupCount * proposal.groupSize !== proposal.playerCount - preliminaryCount
    || proposal.groupSizes.length !== proposal.groupCount
    || proposal.groupSizes.some(size => size !== proposal.groupSize)
  ) {
    throw new Error('O formato não é válido para o número de jogadores inscritos.')
  }
  if (new Set(playerIds).size !== playerIds.length || playerIds.some(id => !id)) {
    throw new Error('Os jogadores têm de ter identificadores únicos.')
  }

  const shuffledPlayerIds = shuffle(playerIds, random)
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

  // Shuffled group order decides which groups get a winner slot; validated above, so each group gets at most one.
  const winnerSlotOrder = preliminaryCount > 0 ? shuffle(groups.map((_, index) => index), random) : []
  for (const [index, match] of preliminaryMatches.entries()) {
    groups[winnerSlotOrder[index]].preliminaryWinnerMatchIds.push(match.id)
  }
  for (const playerId of shuffledPlayerIds.slice(preliminaryCount * 2)) {
    const group = groups.find(candidate =>
      candidate.playerIds.length + candidate.preliminaryWinnerMatchIds.length < proposal.groupSize)
    if (!group) throw new Error('O formato não tem vagas suficientes para os jogadores.')
    group.playerIds.push(playerId)
  }

  return { shuffledPlayerIds, preliminaryPlayerIds, preliminaryMatches, groups }
}

/**
 * Round-robin fixtures in round order (circle method); odd groups rotate a bye.
 * Fixtures of a group that has a preliminary-winner slot must be created only after the preliminary is decided.
 */
export function createRoundRobinFixtures(groupId: string, playerIds: PlayerId[]): TournamentMatch[] {
  if (!groupId || playerIds.length < 2 || new Set(playerIds).size !== playerIds.length || playerIds.some(id => !id)) {
    throw new Error('O grupo requer jogadores com identificadores únicos.')
  }
  // slots hold player indexes; -1 is the bye
  let slots = playerIds.map((_, index) => index)
  if (slots.length % 2 === 1) slots.push(-1)
  const fixtures: TournamentMatch[] = []
  for (let round = 0; round < slots.length - 1; round++) {
    for (let position = 0; position < slots.length / 2; position++) {
      const first = Math.min(slots[position], slots[slots.length - 1 - position])
      const second = Math.max(slots[position], slots[slots.length - 1 - position])
      if (first < 0) continue
      fixtures.push({
        id: `group-${groupId}-${first + 1}-${second + 1}`,
        groupId,
        player1Id: playerIds[first],
        player2Id: playerIds[second],
      })
    }
    slots = [slots[0], slots[slots.length - 1], ...slots.slice(1, -1)]
  }
  return fixtures
}
