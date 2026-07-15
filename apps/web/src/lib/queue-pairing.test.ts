import { describe, expect, it } from 'vitest'
import { MATCH_GAP_SEC, buildPairGroups, computeBaseSec, planRowSwitch, reorderGroups } from './queue-pairing'

describe('buildPairGroups', () => {
  it('returns no groups for an empty queue', () => {
    expect(buildPairGroups([], 0, 480)).toEqual([])
  })

  it('groups an even queue into full pairs', () => {
    const groups = buildPairGroups(['a', 'b', 'c', 'd'], 0, 480)
    expect(groups).toEqual([
      { pairIndex: 0, entryIds: ['a', 'b'], gamesAhead: 0, etaSec: 0, hasPartner: true },
      { pairIndex: 1, entryIds: ['c', 'd'], gamesAhead: 1, etaSec: 540, hasPartner: true },
    ])
  })

  it('leaves a trailing odd entry without a partner', () => {
    const groups = buildPairGroups(['a', 'b', 'c'], 0, 480)
    expect(groups[1]).toEqual({ pairIndex: 1, entryIds: ['c'], gamesAhead: 1, etaSec: 540, hasPartner: false })
  })

  it('matches the approved mockup numbers for a 7-entry queue, field free, 8-minute matches', () => {
    const groups = buildPairGroups(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 0, 480)
    expect(groups.map((g) => g.etaSec)).toEqual([0, 540, 1080, 1620])
    expect(groups.map((g) => g.gamesAhead)).toEqual([0, 1, 2, 3])
    expect(groups[3]?.hasPartner).toBe(false)
  })

  it('adds baseSec as the starting offset for every pair', () => {
    const groups = buildPairGroups(['a', 'b', 'c', 'd'], 200, 480)
    expect(groups.map((g) => g.etaSec)).toEqual([200, 740])
  })
})

describe('computeBaseSec', () => {
  it('is 0 when the field is free', () => {
    expect(computeBaseSec(false, 999)).toBe(0)
  })

  it('is the live match remaining time plus the gap when a match is running', () => {
    expect(computeBaseSec(true, 140)).toBe(140 + MATCH_GAP_SEC)
  })
})

describe('reorderGroups', () => {
  it('moves a pair from a later index to the front', () => {
    const groups = buildPairGroups(['a', 'b', 'c', 'd', 'e', 'f'], 0, 480)
    expect(reorderGroups(groups, 2, 0)).toEqual(['e', 'f', 'a', 'b', 'c', 'd'])
  })

  it('moves a pair from the front to a later index', () => {
    const groups = buildPairGroups(['a', 'b', 'c', 'd', 'e', 'f'], 0, 480)
    expect(reorderGroups(groups, 0, 2)).toEqual(['c', 'd', 'e', 'f', 'a', 'b'])
  })

  it('moves a pair down past a trailing solo entry', () => {
    const groups = buildPairGroups(['a', 'b', 'c', 'd', 'e'], 0, 480)
    expect(reorderGroups(groups, 1, 2)).toEqual(['a', 'b', 'e', 'c', 'd'])
  })

  it('is a no-op when fromIndex and toIndex are the same', () => {
    const groups = buildPairGroups(['a', 'b', 'c', 'd'], 0, 480)
    expect(reorderGroups(groups, 1, 1)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('planRowSwitch', () => {
  it('returns null when dropped at the same position', () => {
    expect(planRowSwitch(['a', 'b', 'c'], 1, 1)).toBeNull()
  })

  it('names the immediate neighbor for an adjacent (1-slot) move down', () => {
    expect(planRowSwitch(['a', 'b', 'c', 'd'], 0, 1)).toEqual({
      fromIndex: 0,
      toIndex: 1,
      movedId: 'a',
      occupantId: 'b',
    })
  })

  it('names the immediate neighbor for an adjacent (1-slot) move up', () => {
    expect(planRowSwitch(['a', 'b', 'c', 'd'], 3, 2)).toEqual({
      fromIndex: 3,
      toIndex: 2,
      movedId: 'd',
      occupantId: 'c',
    })
  })

  it('still names just the immediate neighbor for a multi-slot move down, not whoever ends up at toIndex', () => {
    expect(planRowSwitch(['a', 'b', 'c', 'd', 'e'], 0, 3)).toEqual({
      fromIndex: 0,
      toIndex: 3,
      movedId: 'a',
      occupantId: 'b',
    })
  })

  it('still names just the immediate neighbor for a multi-slot move up, not whoever ends up at toIndex', () => {
    expect(planRowSwitch(['a', 'b', 'c', 'd', 'e'], 4, 1)).toEqual({
      fromIndex: 4,
      toIndex: 1,
      movedId: 'e',
      occupantId: 'd',
    })
  })

  it('returns null when oldIndex is out of range', () => {
    expect(planRowSwitch(['a', 'b', 'c'], 5, 1)).toBeNull()
  })

  it('returns null if the computed occupant index would be out of range', () => {
    expect(planRowSwitch(['a', 'b', 'c'], 0, -1)).toBeNull()
  })
})
