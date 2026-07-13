import { describe, expect, it } from 'vitest'
import { computeReflow, indexForPointerY, pairGestureReducer, type PairGestureState } from './pair-drag-gesture'
import { buildPairGroups, reorderGroups, type PairGroup } from './queue-pairing'

const idle: PairGestureState = { phase: 'idle' }

describe('pairGestureReducer', () => {
  it('arms on the first grip tap', () => {
    expect(pairGestureReducer(idle, { type: 'GRIP_DOWN', groupId: 'g1' })).toEqual({ phase: 'armed', groupId: 'g1' })
  })

  it('moves to holding on a second tap of the same grip while armed', () => {
    const armed: PairGestureState = { phase: 'armed', groupId: 'g1' }
    expect(pairGestureReducer(armed, { type: 'GRIP_DOWN', groupId: 'g1' })).toEqual({ phase: 'holding', groupId: 'g1' })
  })

  it('restarts armed on a different grip while armed for another', () => {
    const armed: PairGestureState = { phase: 'armed', groupId: 'g1' }
    expect(pairGestureReducer(armed, { type: 'GRIP_DOWN', groupId: 'g2' })).toEqual({ phase: 'armed', groupId: 'g2' })
  })

  it('drops back to idle when the double-tap window elapses while armed', () => {
    const armed: PairGestureState = { phase: 'armed', groupId: 'g1' }
    expect(pairGestureReducer(armed, { type: 'DOUBLE_TAP_TIMEOUT' })).toEqual({ phase: 'idle' })
  })

  it('ignores a stray double-tap timeout once already holding', () => {
    const holding: PairGestureState = { phase: 'holding', groupId: 'g1' }
    expect(pairGestureReducer(holding, { type: 'DOUBLE_TAP_TIMEOUT' })).toEqual(holding)
  })

  it('starts dragging when the hold completes', () => {
    const holding: PairGestureState = { phase: 'holding', groupId: 'g1' }
    expect(pairGestureReducer(holding, { type: 'HOLD_COMPLETE' })).toEqual({ phase: 'dragging', groupId: 'g1' })
  })

  it('ignores a stray hold-complete outside holding', () => {
    expect(pairGestureReducer(idle, { type: 'HOLD_COMPLETE' })).toEqual(idle)
  })

  it('cancels from any phase back to idle', () => {
    expect(pairGestureReducer({ phase: 'armed', groupId: 'g1' }, { type: 'CANCEL' })).toEqual({ phase: 'idle' })
    expect(pairGestureReducer({ phase: 'holding', groupId: 'g1' }, { type: 'CANCEL' })).toEqual({ phase: 'idle' })
    expect(pairGestureReducer({ phase: 'dragging', groupId: 'g1' }, { type: 'CANCEL' })).toEqual({ phase: 'idle' })
  })
})

describe('indexForPointerY', () => {
  const rects = [
    { top: 0, height: 100 },
    { top: 100, height: 100 },
    { top: 200, height: 100 },
  ]

  it('returns 0 when the pointer is above the first midpoint', () => {
    expect(indexForPointerY(rects, 10)).toBe(0)
  })

  it('returns the middle index when the pointer is past the first midpoint but before the second', () => {
    expect(indexForPointerY(rects, 120)).toBe(1)
  })

  it('returns the list length when the pointer is past every midpoint', () => {
    expect(indexForPointerY(rects, 999)).toBe(3)
  })

  it('returns 0 for an empty list', () => {
    expect(indexForPointerY([], 50)).toBe(0)
  })
})

describe('computeReflow', () => {
  const rects = [
    { top: 0, height: 132 },
    { top: 148, height: 132 },
    { top: 296, height: 66 },
    { top: 378, height: 132 },
  ]

  it('shifts the passed-over siblings up and moves the placeholder down when dragging down', () => {
    expect(computeReflow(rects, 0, 2)).toEqual({
      placeholderOffset: 230,
      siblingOffsets: [0, -148, -148, 0],
    })
  })

  it('shifts the passed-over siblings down and moves the placeholder up when dragging up', () => {
    expect(computeReflow(rects, 3, 0)).toEqual({
      placeholderOffset: -378,
      siblingOffsets: [148, 148, 148, 0],
    })
  })

  it('is a no-op when toIndex equals fromIndex', () => {
    expect(computeReflow(rects, 1, 1)).toEqual({
      placeholderOffset: 0,
      siblingOffsets: [0, 0, 0, 0],
    })
  })
})

describe('computeReflow matches reorderGroups (the live preview must never disagree with the drop outcome)', () => {
  const groups: PairGroup[] = buildPairGroups(['a', 'b', 'c', 'd', 'e', 'f'], 0, 480)
  const groupRects = [
    { top: 0, height: 132 },
    { top: 148, height: 132 },
    { top: 296, height: 132 },
  ]

  function visualEntryOrder(fromIndex: number, toIndex: number): string[] {
    const { placeholderOffset, siblingOffsets } = computeReflow(groupRects, fromIndex, toIndex)
    return groups
      .map((group, i) => {
        const rect = groupRects[i]
        const top = rect ? rect.top + (i === fromIndex ? placeholderOffset : (siblingOffsets[i] ?? 0)) : 0
        return { group, top }
      })
      .sort((a, b) => a.top - b.top)
      .flatMap((x) => x.group.entryIds)
  }

  it.each([
    [0, 1],
    [0, 2],
    [1, 0],
    [2, 0],
    [1, 2],
    [2, 1],
    [0, 0],
  ])('drag from %i to %i previews the same order reorderGroups commits', (fromIndex, toIndex) => {
    expect(visualEntryOrder(fromIndex, toIndex)).toEqual(reorderGroups(groups, fromIndex, toIndex))
  })
})
