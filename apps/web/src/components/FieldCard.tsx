import { t } from '@/i18n'
import { cn } from '@/lib/cn'
import { timerState, type RunningStatus, type TimerState } from '@/lib/time'
import { Badge, type BadgeState } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CountdownTimer } from '@/components/CountdownTimer'

/**
 * Single responsibility: the field's live surface (client-prd §3.1,
 * design.md §0). Two states:
 * - free: shows the front two teams of the line ("הבא במגרש") and a start
 *   button that pairs them at kickoff — disabled with a reason when the
 *   line has fewer than two teams.
 * - live/paused: active match + timer + controls.
 * - finishing (live at 00:00): a "time's up" state — labels the match done and
 *   offers a one-tap "finish + start next" when a pair is waiting (client-prd
 *   §3.1). Presentational; server owns truth.
 */

interface FreeProps {
  status: 'free'
  fieldName: string
  nextTwo?: { teamA: string; teamB: string }
  onStart?: () => void
}

interface ActiveProps {
  status: RunningStatus
  fieldName: string
  captainA: string
  captainB: string
  secondsLeft: number
  /** One-shot attention flash the moment the timer crosses to 00:00 (see useMatchEndAlert). */
  alerting?: boolean
  /** Front-two of the line — previewed and startable in the finishing (00:00) state. */
  nextTwo?: { teamA: string; teamB: string }
  onPause?: () => void
  onResume?: () => void
  onFinish?: () => void
  /** Finish the current match and immediately kick off nextTwo (finishing state, one tap). */
  onFinishAndNext?: () => void
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
        {props.nextTwo && (
          <p className="mb-2.5 text-sm text-muted">
            {t('field.nextOnField')}{' '}
            <b className="font-semibold text-ink">
              {props.nextTwo.teamA} {t('match.vs')} {props.nextTwo.teamB}
            </b>
          </p>
        )}
        <Button variant="primary" size="big" className="w-full" onClick={props.onStart} disabled={!props.nextTwo}>
          ▶ {t('action.start')}
        </Button>
        {!props.nextTwo && <p className="mt-1.5 text-[12.5px] text-muted">{t('field.startDisabledReason')}</p>}
      </section>
    )
  }

  const state = timerState(props.status, props.secondsLeft)
  // Compact by design: the line below is the hero surface, this is a status header.
  return (
    <section
      className={cn('rounded-[var(--fieldcard-radius)] border-[1.5px] bg-surface p-3', borderByState[state])}
      style={props.alerting ? { animation: 'end-flash 500ms ease-in-out 3' } : undefined}
    >
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
      {state === 'finishing' ? (
        <>
          {props.nextTwo && (
            <p className="mb-2 text-sm text-muted">
              {t('field.nextOnField')}{' '}
              <b className="font-semibold text-ink">
                {props.nextTwo.teamA} {t('match.vs')} {props.nextTwo.teamB}
              </b>
            </p>
          )}
          {props.nextTwo ? (
            <>
              <Button variant="primary" size="big" className="mb-2 w-full" onClick={props.onFinishAndNext}>
                ✓ {t('action.finishAndStartNext')}
              </Button>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={props.onExtend}>{t('action.extendMinute')}</Button>
                <Button variant="danger" className="flex-1" onClick={props.onFinish}>{t('action.finishOnly')}</Button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={props.onExtend}>{t('action.extendMinute')}</Button>
              <Button variant="danger" className="flex-1" onClick={props.onFinish}>{t('action.finish')}</Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex gap-2">
          {props.status === 'paused' ? (
            <Button variant="primary" className="flex-1" onClick={props.onResume}>▶ {t('action.resume')}</Button>
          ) : (
            <Button className="flex-1" onClick={props.onPause}>⏸ {t('action.pause')}</Button>
          )}
          <Button className="flex-1" onClick={props.onExtend}>{t('action.extendMinute')}</Button>
          <Button variant="danger" className="flex-1" onClick={props.onFinish}>{t('action.finish')}</Button>
        </div>
      )}
    </section>
  )
}
