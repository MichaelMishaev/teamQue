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
