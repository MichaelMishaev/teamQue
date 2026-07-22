import { describe, expect, it } from 'vitest'
import { formatClock, formatTimeOfDay, remainingSeconds, timerState } from './time'

describe('formatClock', () => {
  it('formats mm:ss with zero padding', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(7)).toBe('00:07')
    expect(formatClock(277)).toBe('04:37')
    expect(formatClock(360)).toBe('06:00')
  })

  it('clamps negatives to 00:00 (server owns overtime)', () => {
    expect(formatClock(-5)).toBe('00:00')
  })

  it('handles >1h sessions of extend abuse', () => {
    expect(formatClock(3661)).toBe('61:01')
  })
})

describe('formatTimeOfDay', () => {
  it('renders summer timestamps in Israel daylight time', () => {
    expect(formatTimeOfDay('2026-07-22T06:02:23.407Z')).toBe('09:02')
  })

  it('renders winter timestamps in Israel standard time', () => {
    expect(formatTimeOfDay('2026-01-22T07:02:23.407Z')).toBe('09:02')
  })
})

describe('remainingSeconds', () => {
  const endsAt = Date.UTC(2026, 6, 10, 19, 0, 0) // 19:00:00Z

  it('computes whole seconds until endsAt', () => {
    const now = Date.UTC(2026, 6, 10, 18, 55, 23)
    expect(remainingSeconds(endsAt, now)).toBe(277)
  })

  it('is 0 at and after endsAt, never negative', () => {
    expect(remainingSeconds(endsAt, endsAt)).toBe(0)
    expect(remainingSeconds(endsAt, endsAt + 4000)).toBe(0)
  })

  it('rounds up partial seconds so the display never skips ahead', () => {
    expect(remainingSeconds(endsAt, endsAt - 500)).toBe(1)
    expect(remainingSeconds(endsAt, endsAt - 1001)).toBe(2)
  })
})

describe('timerState', () => {
  it('maps paused status directly', () => {
    expect(timerState('paused', 200)).toBe('paused')
  })

  it('derives ending under 60s and finishing at 0 for live matches', () => {
    expect(timerState('live', 61)).toBe('live')
    expect(timerState('live', 60)).toBe('ending')
    expect(timerState('live', 1)).toBe('ending')
    expect(timerState('live', 0)).toBe('finishing')
  })
})
