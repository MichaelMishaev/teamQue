import { t } from '@/i18n'
import { cn } from '@/lib/cn'
import { formatClock, type TimerState } from '@/lib/time'

/** Single responsibility: render remaining time in the state color — display only, never ticks itself. */

const stateClasses: Record<TimerState, string> = {
  live: 'text-accent',
  paused: 'text-warn motion-safe:animate-pulse',
  ending: 'text-danger',
  finishing: 'text-danger opacity-55',
}

export function CountdownTimer({ secondsLeft, state }: { secondsLeft: number; state: TimerState }) {
  return (
    <div
      dir="ltr"
      role="timer"
      aria-label={t(`field.state.${state}`)}
      className={cn(
        'tabular text-center font-mono font-semibold leading-tight',
        'text-[length:var(--timer-font-size)]',
        stateClasses[state],
      )}
    >
      {formatClock(secondsLeft)}
    </div>
  )
}
