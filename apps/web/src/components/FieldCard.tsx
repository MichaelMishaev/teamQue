import { t } from '@/i18n'
import { cn } from '@/lib/cn'
import { timerState, type RunningStatus, type TimerState } from '@/lib/time'
import { Badge, type BadgeState } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CountdownTimer } from '@/components/CountdownTimer'

/**
 * Single responsibility: one field's live surface — active match + timer + controls,
 * or the free state with next-up (client-prd §3.1). Presentational; server owns truth.
 */

interface FreeProps {
  status: 'free'
  fieldName: string
  nextUp?: { captainA: string; captainB: string }
  onStart?: () => void
}

interface ActiveProps {
  status: RunningStatus
  fieldName: string
  captainA: string
  captainB: string
  secondsLeft: number
  onPause?: () => void
  onResume?: () => void
  onFinish?: () => void
  onExtend?: () => void
}

export type FieldCardProps = FreeProps | ActiveProps

const borderByState: Record<TimerState, string> = {
  live: 'border-accent',
  paused: 'border-warn',
  ending: 'border-danger',
  finishing: 'border-danger',
}

const badgeByState: Record<TimerState, BadgeState> = {
  live: 'live',
  paused: 'paused',
  ending: 'ending',
  finishing: 'ending',
}

export function FieldCard(props: FieldCardProps) {
  if (props.status === 'free') {
    return (
      <section className="rounded-[var(--fieldcard-radius)] border-[1.5px] border-dashed border-line bg-surface p-4">
        <header className="mb-2 flex items-center gap-2 text-[12.5px] text-muted">
          <Badge state="free">{t('field.state.free')}</Badge>
          {props.fieldName}
        </header>
        {props.nextUp && (
          <p className="mb-2.5 text-sm text-muted">
            {t('field.nextUp')}{' '}
            <b className="font-semibold text-ink">
              {props.nextUp.captainA} {t('match.vs')} {props.nextUp.captainB}
            </b>
          </p>
        )}
        <Button variant="primary" size="big" className="w-full" onClick={props.onStart} disabled={!props.nextUp}>
          ▶ {t('field.startOn', { field: props.fieldName })}
        </Button>
      </section>
    )
  }

  const state = timerState(props.status, props.secondsLeft)
  // Compact by design: the queue below is the hero surface, this is a status header.
  return (
    <section className={cn('rounded-[var(--fieldcard-radius)] border-[1.5px] bg-surface p-3', borderByState[state])}>
      <header className="mb-1.5 flex items-center gap-2 text-[12.5px] text-muted">
        <Badge state={badgeByState[state]}>{t(`field.state.${state}`)}</Badge>
        {props.fieldName}
      </header>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="min-w-0 text-[17px] font-bold tracking-tight">
          {props.captainA} <span className="text-[12.5px] font-normal text-muted">{t('match.vs')}</span> {props.captainB}
        </p>
        <CountdownTimer secondsLeft={props.secondsLeft} state={state} />
      </div>
      <div className="flex gap-2">
        {props.status === 'paused' ? (
          <Button variant="primary" className="flex-1" onClick={props.onResume}>▶ {t('action.resume')}</Button>
        ) : (
          <Button className="flex-1" onClick={props.onPause}>⏸ {t('action.pause')}</Button>
        )}
        <Button className="flex-1" onClick={props.onExtend}>{t('action.extendMinute')}</Button>
        <Button variant="danger" className="flex-1" onClick={props.onFinish}>{t('action.finish')}</Button>
      </div>
    </section>
  )
}
