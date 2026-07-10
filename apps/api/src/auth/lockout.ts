/**
 * Progressive staff-PIN lockout math (technical-prd §6, R-25). Below the
 * threshold there's no lockout; from the threshold on, duration doubles
 * each further failed attempt, capped. A request made while still locked
 * never reaches this function (the lockout check runs before any PIN
 * comparison), so failures during an active lock never extend it.
 */
export const LOCKOUT_THRESHOLD = 5
export const BASE_LOCKOUT_SEC = 60
export const MAX_LOCKOUT_SEC = 3600

export function lockoutDurationSec(failedAttempts: number): number {
  if (failedAttempts < LOCKOUT_THRESHOLD) return 0

  const exponent = failedAttempts - LOCKOUT_THRESHOLD
  return Math.min(MAX_LOCKOUT_SEC, BASE_LOCKOUT_SEC * 2 ** exponent)
}
