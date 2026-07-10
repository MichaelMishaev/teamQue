import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCountdown } from './useCountdown'

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.UTC(2026, 6, 10, 19, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 0 when endsAtMs is null', () => {
    const { result } = renderHook(() =>
      useCountdown({ endsAtMs: null, pausedRemainingSec: null, offsetMs: 0 }),
    )
    expect(result.current).toBe(0)
  })

  it('computes whole seconds left from endsAtMs and offsetMs', () => {
    const endsAtMs = Date.now() + 277_000
    const { result } = renderHook(() =>
      useCountdown({ endsAtMs, pausedRemainingSec: null, offsetMs: 0 }),
    )
    expect(result.current).toBe(277)
  })

  it('applies the server-clock offset when computing remaining seconds', () => {
    // client clock is 5s behind the server; offsetMs makes up the difference
    const endsAtMs = Date.now() + 100_000
    const { result } = renderHook(() =>
      useCountdown({ endsAtMs, pausedRemainingSec: null, offsetMs: 5000 }),
    )
    expect(result.current).toBe(95)
  })

  it('pausedRemainingSec wins over endsAtMs when non-null', () => {
    const endsAtMs = Date.now() + 277_000
    const { result } = renderHook(() =>
      useCountdown({ endsAtMs, pausedRemainingSec: 42, offsetMs: 0 }),
    )
    expect(result.current).toBe(42)
  })

  it('treats pausedRemainingSec of 0 as a win over endsAtMs (0 is non-null)', () => {
    const endsAtMs = Date.now() + 277_000
    const { result } = renderHook(() =>
      useCountdown({ endsAtMs, pausedRemainingSec: 0, offsetMs: 0 }),
    )
    expect(result.current).toBe(0)
  })

  it('recomputes every second via setInterval', () => {
    const endsAtMs = Date.now() + 5000
    const { result } = renderHook(() =>
      useCountdown({ endsAtMs, pausedRemainingSec: null, offsetMs: 0 }),
    )
    expect(result.current).toBe(5)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current).toBe(4)

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current).toBe(2)
  })

  it('recomputes immediately on a document visibilitychange event', () => {
    const endsAtMs = Date.now() + 10_000
    const { result } = renderHook(() =>
      useCountdown({ endsAtMs, pausedRemainingSec: null, offsetMs: 0 }),
    )
    expect(result.current).toBe(10)

    // time passes without a timer tick, then the tab becomes visible again
    act(() => {
      vi.setSystemTime(Date.now() + 4000)
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe(6)
  })
})
