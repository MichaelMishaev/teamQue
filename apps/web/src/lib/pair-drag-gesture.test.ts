import { describe, expect, it } from 'vitest'
import { pairGestureReducer, type PairGestureState } from './pair-drag-gesture'

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
