/** Single responsibility: the 04:30–05:00 warning for the server-owned daily
 * reset, including its one-day Stop action. It renders time from server clock
 * offset and owns no reset truth. */
import { useEffect, useState } from 'react'
import { dailyResetWarningSeconds } from 'shared'
import { t } from '@/i18n'
import { formatClock } from '@/lib/time'

export function DailyResetCard({ resetAt, offsetMs, onStop }: { resetAt: string; offsetMs: number; onStop(): Promise<void> }) {
  const resetAtMs = new Date(resetAt).getTime()
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() => warningSeconds(resetAtMs, offsetMs))
  const [stopping, setStopping] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    setDismissed(false)
    const recompute = () => setSecondsLeft(warningSeconds(resetAtMs, offsetMs))
    recompute()
    const interval = setInterval(recompute, 1_000)
    document.addEventListener('visibilitychange', recompute)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', recompute)
    }
  }, [offsetMs, resetAtMs])

  if (secondsLeft === null || dismissed) return null

  async function stop(): Promise<void> {
    if (stopping) return
    setStopping(true)
    setError(false)
    try {
      await onStop()
      setDismissed(true)
    } catch {
      setError(true)
    } finally {
      setStopping(false)
    }
  }

  return (
    <section role="status" aria-label={t('dailyReset.a11y')} className="rounded-card border border-warn bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-warn">{t('dailyReset.title')}</p>
          <p className="mt-1 text-[13px] text-muted">{t('dailyReset.hint')}</p>
        </div>
        <bdi dir="ltr" className="tabular shrink-0 font-mono text-[24px] font-bold text-ink">
          {formatClock(secondsLeft)}
        </bdi>
      </div>
      <button
        type="button"
        className="mt-3 min-h-[var(--touch-target-min)] w-full rounded-[var(--btn-radius)] border border-line bg-surface-2 px-4 text-[14px] font-semibold text-ink disabled:opacity-50"
        disabled={stopping}
        onClick={() => void stop()}
      >
        {stopping ? t('dailyReset.stopping') : t('dailyReset.stop')}
      </button>
      {error && <p role="alert" className="mt-2 text-[13px] font-semibold text-danger">{t('dailyReset.error')}</p>}
    </section>
  )
}

function warningSeconds(resetAtMs: number, offsetMs: number): number | null {
  return dailyResetWarningSeconds(new Date(resetAtMs), new Date(Date.now() + offsetMs))
}
