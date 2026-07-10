/**
 * Unit test (pure function, no DB): the deterministic search ordering rule
 * from features-prd US-020..022 / the task brief:
 *   (1) prefix match on name OR nickname first
 *   (2) lastPlayedAt desc, nulls last
 *   (3) createdAt desc as the final tie-break
 * An empty query prefix-matches every row, so (1) collapses to a no-op and
 * the result is ordered by (2)+(3) alone — asserted explicitly below.
 */
import { describe, expect, it } from 'vitest'
import { sortCaptainSearchResults, type CaptainSearchRow } from './search-order'

function row(overrides: Partial<CaptainSearchRow>): CaptainSearchRow {
  return {
    id: 'id',
    name: 'name',
    nickname: null,
    note: null,
    tags: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    gamesToday: 0,
    lastPlayedAt: null,
    ...overrides,
  }
}

describe('sortCaptainSearchResults', () => {
  it('ranks a prefix match on name above a non-prefix (contains-only) match', () => {
    const contains = row({ id: 'contains', name: 'הדניאל' })
    const prefix = row({ id: 'prefix', name: 'דניאל' })

    const sorted = sortCaptainSearchResults([contains, prefix], 'דני')

    expect(sorted.map((r) => r.id)).toEqual(['prefix', 'contains'])
  })

  it('ranks a prefix match on nickname above a non-prefix match on name', () => {
    const nameOnly = row({ id: 'name-only', name: 'הדני-קטע' })
    const nicknamePrefix = row({ id: 'nick-prefix', name: 'זזז', nickname: 'דני הקטן' })

    const sorted = sortCaptainSearchResults([nameOnly, nicknamePrefix], 'דני')

    expect(sorted.map((r) => r.id)).toEqual(['nick-prefix', 'name-only'])
  })

  it('is case-insensitive for prefix matching', () => {
    const upper = row({ id: 'upper', name: 'Daniel' })
    expect(sortCaptainSearchResults([upper], 'dan').map((r) => r.id)).toEqual(['upper'])
  })

  it('within the same prefix tier, orders by lastPlayedAt desc with nulls last', () => {
    const never = row({ id: 'never', lastPlayedAt: null })
    const older = row({ id: 'older', lastPlayedAt: new Date('2026-07-10T18:00:00.000Z') })
    const newer = row({ id: 'newer', lastPlayedAt: new Date('2026-07-10T19:00:00.000Z') })

    const sorted = sortCaptainSearchResults([never, older, newer], '')

    expect(sorted.map((r) => r.id)).toEqual(['newer', 'older', 'never'])
  })

  it('ties on lastPlayedAt (including all-null) break by createdAt desc', () => {
    const early = row({ id: 'early', createdAt: new Date('2026-01-01T00:00:00.000Z') })
    const late = row({ id: 'late', createdAt: new Date('2026-02-01T00:00:00.000Z') })

    const sorted = sortCaptainSearchResults([early, late], '')

    expect(sorted.map((r) => r.id)).toEqual(['late', 'early'])
  })

  it('empty query: every row prefix-matches, so ordering collapses to (2)+(3) only', () => {
    const a = row({ id: 'a', name: 'זזז', lastPlayedAt: new Date('2026-07-10T18:00:00.000Z') })
    const b = row({ id: 'b', name: 'אאא', lastPlayedAt: new Date('2026-07-10T19:00:00.000Z') })

    const sorted = sortCaptainSearchResults([a, b], '')

    expect(sorted.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('does not mutate the input array', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })]
    const copy = [...rows]

    sortCaptainSearchResults(rows, '')

    expect(rows).toEqual(copy)
  })
})
