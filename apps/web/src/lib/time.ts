/**
 * Timer math — pure functions over server snapshot fields (technical-prd §4).
 * Timers are computed, never ticked: the server owns endsAt; clients render.
 */

export type MatchStatus = 'live' | 'paused'
export type TimerState = 'live' | 'paused' | 'ending' | 'finishing'

/** Seconds under which a live match renders as "ending" (red). */
export const ENDING_THRESHOLD_SEC = 60

/** mm:ss, zero-padded, clamped at 00:00. Minutes may exceed 59. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  const minutes = Math.floor(s / 60)
  const seconds = s % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * Whole seconds remaining until endsAt, rounded UP so the displayed value
 * never reaches 00:00 before the server does. Never negative.
 */
export function remainingSeconds(endsAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000))
}

/**
 * Visual timer state (design.md §1 state language). "ending" and "finishing"
 * are derived, not stored — the server only knows live/paused.
 */
export function timerState(status: MatchStatus, secondsLeft: number): TimerState {
  if (status === 'paused') return 'paused'
  if (secondsLeft <= 0) return 'finishing'
  if (secondsLeft <= ENDING_THRESHOLD_SEC) return 'ending'
  return 'live'
}
