import { afterEach, describe, expect, it, vi } from 'vitest'
import { dailyResetWarningSeconds, jerusalemResetAtForLocalDate, nextJerusalemDailyResetAt } from './daily-reset.js'

afterEach(() => vi.useRealTimers())

describe('Jerusalem daily reset schedule', () => {
  it('uses 05:00 Jerusalem across daylight-saving changes', () => {
    expect(jerusalemResetAtForLocalDate('2026-08-10').toISOString()).toBe('2026-08-10T02:00:00.000Z')
    expect(jerusalemResetAtForLocalDate('2026-01-10').toISOString()).toBe('2026-01-10T03:00:00.000Z')
  })

  it('targets today before 05:00 and tomorrow from 05:00 onward', () => {
    expect(nextJerusalemDailyResetAt(new Date('2026-08-10T01:29:59.000Z')).toISOString()).toBe('2026-08-10T02:00:00.000Z')
    expect(nextJerusalemDailyResetAt(new Date('2026-08-10T02:00:00.000Z')).toISOString()).toBe('2026-08-11T02:00:00.000Z')
  })

  it('exposes a 30-minute countdown only during the warning window', () => {
    const resetAt = new Date('2026-08-10T02:00:00.000Z')
    expect(dailyResetWarningSeconds(resetAt, new Date('2026-08-10T01:29:59.000Z'))).toBeNull()
    expect(dailyResetWarningSeconds(resetAt, new Date('2026-08-10T01:30:00.000Z'))).toBe(30 * 60)
    expect(dailyResetWarningSeconds(resetAt, new Date('2026-08-10T01:59:59.001Z'))).toBe(1)
    expect(dailyResetWarningSeconds(resetAt, resetAt)).toBeNull()
  })
})
