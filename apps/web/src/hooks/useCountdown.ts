/**
 * Whole seconds left on a match timer (technical-prd §4). Timers are computed,
 * never ticked: this hook just re-derives the value every second and on
 * visibilitychange — the server-owned endsAt/pausedRemainingSec never move here.
 */
import { useEffect, useState } from 'react'
import { remainingSeconds } from '@/lib/time'

export interface UseCountdownInput {
  endsAtMs: number | null
  pausedRemainingSec: number | null
  offsetMs: number
}

function computeSecondsLeft({ endsAtMs, pausedRemainingSec, offsetMs }: UseCountdownInput): number {
  if (pausedRemainingSec !== null) return pausedRemainingSec
  if (endsAtMs === null) return 0
  return remainingSeconds(endsAtMs, Date.now() + offsetMs)
}

export function useCountdown(input: UseCountdownInput): number {
  const { endsAtMs, pausedRemainingSec, offsetMs } = input
  const [secondsLeft, setSecondsLeft] = useState(() => computeSecondsLeft(input))

  useEffect(() => {
    const recompute = () => setSecondsLeft(computeSecondsLeft({ endsAtMs, pausedRemainingSec, offsetMs }))

    recompute()
    const interval = setInterval(recompute, 1000)
    document.addEventListener('visibilitychange', recompute)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', recompute)
    }
  }, [endsAtMs, pausedRemainingSec, offsetMs])

  return secondsLeft
}
