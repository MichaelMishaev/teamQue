/**
 * Pure state machine for the "double-tap-and-hold to drag a pair" gesture
 * (docs/superpowers/specs/2026-07-13-queue-pair-move-design.md). Callers own
 * all timers (setTimeout for the double-tap window and the hold duration)
 * and dispatch events into this reducer — kept timer-free so transitions
 * are unit-testable without simulating real time or pointer geometry.
 */

export const DOUBLE_TAP_WINDOW_MS = 350
export const HOLD_MS = 380

export type PairGestureState =
  | { phase: 'idle' }
  | { phase: 'armed'; groupId: string }
  | { phase: 'holding'; groupId: string }
  | { phase: 'dragging'; groupId: string }

export type PairGestureEvent =
  | { type: 'GRIP_DOWN'; groupId: string }
  | { type: 'DOUBLE_TAP_TIMEOUT' }
  | { type: 'HOLD_COMPLETE' }
  | { type: 'CANCEL' }

export function pairGestureReducer(state: PairGestureState, event: PairGestureEvent): PairGestureState {
  switch (event.type) {
    case 'GRIP_DOWN':
      if (state.phase === 'armed' && state.groupId === event.groupId) {
        return { phase: 'holding', groupId: event.groupId }
      }
      return { phase: 'armed', groupId: event.groupId }
    case 'DOUBLE_TAP_TIMEOUT':
      return state.phase === 'armed' ? { phase: 'idle' } : state
    case 'HOLD_COMPLETE':
      return state.phase === 'holding' ? { phase: 'dragging', groupId: state.groupId } : state
    case 'CANCEL':
      return { phase: 'idle' }
  }
}

export interface RectLike {
  top: number
  height: number
}

/**
 * Given the vertical rects of the groups NOT being dragged (in current visual
 * order), returns the index the dragged group should land at for a given
 * pointer Y position — the pointer crossing a rect's vertical midpoint is
 * what flips the target index, matching the approved mockup's behavior.
 */
export function indexForPointerY(rects: RectLike[], pointerY: number): number {
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]
    if (rect && pointerY < rect.top + rect.height / 2) return i
  }
  return rects.length
}

export interface ReflowResult {
  /** Pixels the dragged group's placeholder must translate to reach the current drop target. */
  placeholderOffset: number
  /** Pixels each group (indexed by its original position) must translate to open/close the
   *  gap; 0 for unaffected groups and for the dragged group's own index. */
  siblingOffsets: number[]
}

/**
 * Given every group's natural (pre-drag) rect in original order, computes how far the dragged
 * group's placeholder and each unaffected sibling must translate to visually reflect dropping
 * at `toIndex`. Derived from a single measurement pass (rects captured once at drag-start) so
 * it never re-reads — and never fights — live transformed layout.
 */
export function computeReflow(rects: RectLike[], fromIndex: number, toIndex: number): ReflowResult {
  const dragged = rects[fromIndex]
  const first = rects[0]
  const second = rects[1]
  const gap = first && second ? second.top - (first.top + first.height) : 0
  const shiftUnit = dragged ? dragged.height + gap : 0

  const siblingOffsets = rects.map((_, originalIndex) => {
    if (originalIndex === fromIndex) return 0
    const trimmedIndex = originalIndex < fromIndex ? originalIndex : originalIndex - 1
    if (originalIndex < fromIndex && trimmedIndex >= toIndex) return shiftUnit
    if (originalIndex > fromIndex && trimmedIndex < toIndex) return -shiftUnit
    return 0
  })

  let placeholderOffset = 0
  if (toIndex > fromIndex) {
    for (let i = fromIndex + 1; i <= toIndex; i++) {
      const r = rects[i]
      if (r) placeholderOffset += r.height + gap
    }
  } else if (toIndex < fromIndex) {
    for (let i = toIndex; i <= fromIndex - 1; i++) {
      const r = rects[i]
      if (r) placeholderOffset -= r.height + gap
    }
  }

  return { placeholderOffset, siblingOffsets }
}
