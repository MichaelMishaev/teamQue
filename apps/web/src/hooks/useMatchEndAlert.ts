/**
 * Fires a one-shot alert (beep + visual flash) the moment a *live* match timer
 * crosses to 00:00. Timers are computed, never ticked (technical-prd §4), so
 * this hook watches the derived secondsLeft for the >0 → ≤0 edge — the crossing
 * is not an event anywhere else. Keyed by matchId so it fires exactly once per
 * match, never on a screen that loads already at 00:00, and never while paused.
 */
import { useEffect, useRef, useState } from 'react'
import type { MatchStatus } from 'shared'
import { playEndBeep } from '@/lib/beep'

/** How long the returned `alerting` flag stays true after the crossing (ms). */
export const ALERT_DURATION_MS = 1500

export interface UseMatchEndAlertInput {
  matchId: string | null
  status: MatchStatus
  secondsLeft: number
}

export function useMatchEndAlert(
  { matchId, status, secondsLeft }: UseMatchEndAlertInput,
  playBeep: () => void = playEndBeep,
): boolean {
  const [alerting, setAlerting] = useState(false)
  const prevMatchIdRef = useRef<string | null>(null)
  const prevSecondsRef = useRef<number | null>(null)

  useEffect(() => {
    if (matchId === null) {
      prevMatchIdRef.current = null
      prevSecondsRef.current = null
      return
    }

    // New match: seed without firing, so a screen that loads at 00:00 stays silent.
    if (matchId !== prevMatchIdRef.current) {
      prevMatchIdRef.current = matchId
      prevSecondsRef.current = secondsLeft
      return
    }

    const prev = prevSecondsRef.current
    prevSecondsRef.current = secondsLeft

    if (status === 'live' && prev !== null && prev > 0 && secondsLeft <= 0) {
      playBeep()
      setAlerting(true)
    }
  }, [matchId, status, secondsLeft, playBeep])

  useEffect(() => {
    if (!alerting) return
    const timeout = setTimeout(() => setAlerting(false), ALERT_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [alerting])

  return alerting
}
