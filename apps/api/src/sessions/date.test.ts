/**
 * Unit test (pure function): a session's `date` is "today in Asia/Jerusalem"
 * (technical-prd §3), not the server/UTC date — the two disagree for part of
 * every evening, which is exactly when sessions get opened.
 */
import { describe, expect, it } from 'vitest'
import { todayInJerusalem } from './date'

describe('todayInJerusalem', () => {
  it('returns the UTC date when Jerusalem has not yet rolled over', () => {
    // 08:00 UTC = 11:00 Jerusalem (summer, UTC+3) — same calendar day.
    expect(todayInJerusalem(new Date('2026-07-10T08:00:00.000Z'))).toBe('2026-07-10')
  })

  it('returns the NEXT day once Jerusalem has rolled over past UTC midnight', () => {
    // 22:30 UTC = 01:30 Jerusalem the next day (summer, UTC+3).
    expect(todayInJerusalem(new Date('2026-07-10T22:30:00.000Z'))).toBe('2026-07-11')
  })

  it('formats as YYYY-MM-DD (Postgres date literal)', () => {
    expect(todayInJerusalem(new Date('2026-01-05T08:00:00.000Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
