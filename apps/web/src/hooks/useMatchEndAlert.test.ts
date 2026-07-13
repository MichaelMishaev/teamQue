import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALERT_DURATION_MS, useMatchEndAlert } from './useMatchEndAlert'

describe('useMatchEndAlert', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not fire on mount while the live match still has time left', () => {
    const beep = vi.fn()
    const { result } = renderHook(() =>
      useMatchEndAlert({ matchId: 'm1', status: 'live', secondsLeft: 30 }, beep),
    )
    expect(beep).not.toHaveBeenCalled()
    expect(result.current).toBe(false)
  })

  it('does not fire on mount when the live match is already at 00:00', () => {
    const beep = vi.fn()
    const { result } = renderHook(() =>
      useMatchEndAlert({ matchId: 'm1', status: 'live', secondsLeft: 0 }, beep),
    )
    expect(beep).not.toHaveBeenCalled()
    expect(result.current).toBe(false)
  })

  it('fires the beep once when a live match crosses from >0 to 00:00', () => {
    const beep = vi.fn()
    const { result, rerender } = renderHook((props) => useMatchEndAlert(props, beep), {
      initialProps: { matchId: 'm1', status: 'live' as const, secondsLeft: 1 },
    })
    expect(beep).not.toHaveBeenCalled()

    rerender({ matchId: 'm1', status: 'live', secondsLeft: 0 })
    expect(beep).toHaveBeenCalledTimes(1)
    expect(result.current).toBe(true)
  })

  it('does not fire again while sitting at 00:00', () => {
    const beep = vi.fn()
    const { rerender } = renderHook((props) => useMatchEndAlert(props, beep), {
      initialProps: { matchId: 'm1', status: 'live' as const, secondsLeft: 1 },
    })
    rerender({ matchId: 'm1', status: 'live', secondsLeft: 0 })
    rerender({ matchId: 'm1', status: 'live', secondsLeft: 0 })
    rerender({ matchId: 'm1', status: 'live', secondsLeft: 0 })
    expect(beep).toHaveBeenCalledTimes(1)
  })

  it('does not fire when the match is paused at the crossing', () => {
    const beep = vi.fn()
    const { rerender } = renderHook((props) => useMatchEndAlert(props, beep), {
      initialProps: { matchId: 'm1', status: 'paused' as const, secondsLeft: 1 },
    })
    rerender({ matchId: 'm1', status: 'paused', secondsLeft: 0 })
    expect(beep).not.toHaveBeenCalled()
  })

  it('fires again for a different match id', () => {
    const beep = vi.fn()
    const { rerender } = renderHook((props) => useMatchEndAlert(props, beep), {
      initialProps: { matchId: 'm1', status: 'live' as const, secondsLeft: 1 },
    })
    rerender({ matchId: 'm1', status: 'live', secondsLeft: 0 })
    expect(beep).toHaveBeenCalledTimes(1)

    // a new match starts at 1s then crosses — should beep again
    rerender({ matchId: 'm2', status: 'live', secondsLeft: 1 })
    rerender({ matchId: 'm2', status: 'live', secondsLeft: 0 })
    expect(beep).toHaveBeenCalledTimes(2)
  })

  it('clears the alerting flag after ALERT_DURATION_MS', () => {
    const beep = vi.fn()
    const { result, rerender } = renderHook((props) => useMatchEndAlert(props, beep), {
      initialProps: { matchId: 'm1', status: 'live' as const, secondsLeft: 1 },
    })
    rerender({ matchId: 'm1', status: 'live', secondsLeft: 0 })
    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(ALERT_DURATION_MS)
    })
    expect(result.current).toBe(false)
  })

  it('does nothing when there is no live match', () => {
    const beep = vi.fn()
    const { result } = renderHook(() =>
      useMatchEndAlert({ matchId: null, status: 'live', secondsLeft: 0 }, beep),
    )
    expect(beep).not.toHaveBeenCalled()
    expect(result.current).toBe(false)
  })
})
