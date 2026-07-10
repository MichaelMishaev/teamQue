/**
 * Deterministic search ordering (features-prd US-020..022, task 3a brief):
 * (1) prefix match on name OR nickname first, (2) lastPlayedAt desc with
 * nulls last, (3) createdAt desc as the final tie-break. Kept as a pure
 * function, applied in-process to the (already center + name/nickname
 * filtered, DB-side) candidate rows so it's unit-testable without a DB —
 * the DB side of the search only has to filter and aggregate, not order.
 *
 * An empty query prefix-matches every row (`''.startsWith('')` etc.), so
 * tier (1) becomes a no-op and the result collapses to (2)+(3) — matching
 * "empty q -> 20 captains by (2)+(3)" without a special case.
 */
export type CaptainSearchRow = {
  id: string
  name: string
  nickname: string | null
  note: string | null
  tags: string[]
  createdAt: Date
  gamesToday: number
  lastPlayedAt: Date | null
}

export function sortCaptainSearchResults<T extends CaptainSearchRow>(rows: readonly T[], q: string): T[] {
  const needle = q.trim().toLowerCase()
  const isPrefixMatch = (row: T): boolean =>
    row.name.toLowerCase().startsWith(needle) || (row.nickname?.toLowerCase().startsWith(needle) ?? false)

  return [...rows].sort((a, b) => {
    const prefixDiff = Number(isPrefixMatch(b)) - Number(isPrefixMatch(a))
    if (prefixDiff !== 0) return prefixDiff

    const aLastPlayed = a.lastPlayedAt?.getTime() ?? -Infinity
    const bLastPlayed = b.lastPlayedAt?.getTime() ?? -Infinity
    if (bLastPlayed !== aLastPlayed) return bLastPlayed - aLastPlayed

    return b.createdAt.getTime() - a.createdAt.getTime()
  })
}
