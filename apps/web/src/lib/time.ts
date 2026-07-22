/**
 * Timer math — pure functions over server snapshot fields (technical-prd §4).
 * Timers are computed, never ticked: the server owns endsAt; clients render.
 */
import type { MatchStatus } from 'shared'

/** The subset of MatchStatus a running/paused timer can be in. */
export type RunningStatus = Extract<MatchStatus, 'live' | 'paused'>
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
export function timerState(status: RunningStatus, secondsLeft: number): TimerState {
  if (status === 'paused') return 'paused'
  if (secondsLeft <= 0) return 'finishing'
  if (secondsLeft <= ENDING_THRESHOLD_SEC) return 'ending'
  return 'live'
}

/** The subset of MatchView fields useCountdown's input can be derived from — kept structural so this stays decoupled from any one MatchView source. */
export interface MatchCountdownSource {
  status: MatchStatus
  startedAt: string | null
  pausedAt: string | null
  accumulatedPauseSec: number
  endsAt: string | null
  plannedDurationSec: number
}

/** Adapts a snapshot match into useCountdown's input shape (technical-prd §4 formula). */
export function matchCountdownInput(match: MatchCountdownSource): { endsAtMs: number | null; pausedRemainingSec: number | null } {
  if (match.status === 'paused' && match.startedAt !== null && match.pausedAt !== null) {
    const elapsedSec = Math.floor((new Date(match.pausedAt).getTime() - new Date(match.startedAt).getTime()) / 1000) - match.accumulatedPauseSec
    return { endsAtMs: null, pausedRemainingSec: Math.max(0, match.plannedDurationSec - elapsedSec) }
  }
  if (match.status === 'live' && match.endsAt !== null) {
    return { endsAtMs: new Date(match.endsAt).getTime(), pausedRemainingSec: null }
  }
  return { endsAtMs: null, pausedRemainingSec: null }
}

/** Israel-local 24h clock for a moment, LTR-rendered by the caller (design.md §2/§3). */
export function formatTimeOfDay(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}
