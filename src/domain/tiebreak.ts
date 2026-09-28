import type { GroupStanding, PlayerId } from './types'

/** Players sharing a rank that still requires a draw, in standings order. */
export function pendingTies(standings: GroupStanding[]): PlayerId[][] {
  const ties = new Map<number, PlayerId[]>()
  for (const row of standings) {
    if (row.requiresDraw) ties.set(row.rank, [...ties.get(row.rank) ?? [], row.playerId])
  }
  return [...ties.values()]
}

const sameSet = (a: PlayerId[], b: PlayerId[]) => a.length === b.length && a.every(id => b.includes(id))

/**
 * Applies stored draw orders on top of calculated standings. A draw applies only to a tie with
 * exactly the same players, so a correction that changes the tie makes the old draw stale. Stored draws
 * are never deleted: if a later correction recreates the same tied set, the earlier draw applies again
 * (it was already audited when it was made).
 */
export function applyTieDraws(standings: GroupStanding[], draws: PlayerId[][]): GroupStanding[] {
  const result = standings.map(row => ({ ...row }))
  for (const tie of pendingTies(standings)) {
    const order = draws.find(draw => sameSet(draw, tie))
    if (!order) continue
    const start = result.findIndex(row => row.playerId === tie[0])
    const rank = result[start].rank
    const drawn = order.map((playerId, index) => ({
      ...result.find(row => row.playerId === playerId)!,
      rank: rank + index,
      requiresDraw: false,
    }))
    result.splice(start, drawn.length, ...drawn)
  }
  return result
}

/** Fisher–Yates shuffle over an injected random source in [0, 1). */
export function drawOrder(playerIds: PlayerId[], random: () => number): PlayerId[] {
  const result = [...playerIds]
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
