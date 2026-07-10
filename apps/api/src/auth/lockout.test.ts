/**
 * Unit test: progressive PIN lockout duration (technical-prd §6/R-25).
 * Below the 5-failure threshold: no lockout. From the 5th failure on:
 * 60s, doubling each further failure, capped at 3600s.
 */
import { describe, expect, it } from 'vitest'
import { lockoutDurationSec } from './lockout'

describe('lockoutDurationSec', () => {
  it.each([
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
    [5, 60],
    [6, 120],
    [7, 240],
    [8, 480],
    [9, 960],
    [10, 1920],
    [11, 3600],
    [12, 3600],
    [20, 3600],
  ])('failedAttempts=%i -> %i sec', (failedAttempts, expected) => {
    expect(lockoutDurationSec(failedAttempts)).toBe(expected)
  })

  it('never returns a negative duration for zero attempts', () => {
    expect(lockoutDurationSec(0)).toBe(0)
  })
})
