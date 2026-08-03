import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'
import { cn } from '@/lib/cn'
import { formatClock, timerState, type RunningStatus, type TimerState } from '@/lib/time'

/**
 * Single responsibility: a distraction-free, full-viewport control surface for
 * the current match. It is temporary client UI only; the session snapshot and
 * existing match actions remain the source of truth.
 */

const HOLD_DELAY_MS = 1200

const stateClasses: Record<TimerState, string> = {
  live: 'border-accent text-accent',
  paused: 'border-warn text-warn',
  ending: 'border-danger text-danger',
  finishing: 'border-danger text-danger',
}

const timerClasses: Record<TimerState, string> = {
  live: 'text-accent',
  paused: 'text-warn',
  ending: 'text-danger',
  finishing: 'text-danger',
}

interface RefereeModeProps {
  fieldName: string
  captainA: string
  captainB: string
  secondsLeft: number
  status: RunningStatus
  onClose: () => void
  onPause?: () => void
  onResume?: () => void
  onExtend?: () => void
  onFinish?: () => void
  busy?: boolean
  error?: string | null
}

interface HoldAction {
  holding: boolean
  start: () => void
  cancel: () => void
}

function useHoldAction(onComplete?: () => void): HoldAction {
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [holding, setHolding] = useState(false)

  function cancel() {
    if (timeoutId.current !== null) {
      clearTimeout(timeoutId.current)
      timeoutId.current = null
    }
    setHolding(false)
  }

  function start() {
    if (!onComplete || timeoutId.current !== null) return

    setHolding(true)
    timeoutId.current = setTimeout(() => {
      timeoutId.current = null
      setHolding(false)
      onComplete()
    }, HOLD_DELAY_MS)
  }

  useEffect(
    () => () => {
      if (timeoutId.current !== null) clearTimeout(timeoutId.current)
    },
    [],
  )

  return { holding, start, cancel }
}

function keyStartsHold(event: KeyboardEvent<HTMLButtonElement>, start: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    start()
  }
}

function keyCancelsHold(event: KeyboardEvent<HTMLButtonElement>, cancel: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    cancel()
  }
}

function holdHandlers(action: HoldAction) {
  return {
    onPointerDown: action.start,
    onPointerUp: action.cancel,
    onPointerCancel: action.cancel,
    onPointerLeave: action.cancel,
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => keyStartsHold(event, action.start),
    onKeyUp: (event: KeyboardEvent<HTMLButtonElement>) => keyCancelsHold(event, action.cancel),
  }
}

function keepFocusInMode(event: KeyboardEvent<HTMLElement>, locked: boolean, busy: boolean, onClose: () => void) {
  if (event.key === 'Escape' && !locked && !busy) {
    event.preventDefault()
    onClose()
    return
  }
  if (event.key !== 'Tab') return

  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) return

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

export function RefereeMode({
  fieldName,
  captainA,
  captainB,
  secondsLeft,
  status,
  onClose,
  onPause,
  onResume,
  onExtend,
  onFinish,
  busy = false,
  error = null,
}: RefereeModeProps) {
  const [locked, setLocked] = useState(false)
  const unlock = useHoldAction(() => setLocked(false))
  const finish = useHoldAction(onFinish)
  const state = timerState(status, secondsLeft)
  const isFinishing = state === 'finishing'

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label={t('referee.title')}
      aria-busy={busy}
      onKeyDown={(event) => keepFocusInMode(event, locked, busy, onClose)}
      className={cn(
        'fixed inset-0 z-50 flex min-h-dvh flex-col overflow-y-auto border-t-4 bg-bg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]',
        stateClasses[state],
      )}
    >
      <header className="flex min-h-[var(--touch-target-min)] items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-muted">{t('referee.title')}</p>
          <p className="truncate text-sm text-ink">{fieldName}</p>
        </div>
        {!locked && (
          <Button
            autoFocus
            variant="ghost"
            className="min-h-[var(--touch-target-min)] shrink-0 px-2 text-[13px]"
            onClick={onClose}
            disabled={busy}
          >
            {t('referee.close')}
          </Button>
        )}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        <h1 className="text-[clamp(1.25rem,6vw,2rem)] font-bold tracking-tight text-ink">
          {captainA} <span className="text-[0.68em] font-normal text-muted">{t('match.vs')}</span> {captainB}
        </h1>
        <p aria-live="polite" className="mt-3 text-sm font-semibold text-muted">{t(`field.state.${state}`)}</p>
        <div
          dir="ltr"
          role="timer"
          aria-label={t('referee.timerLabel')}
          className={cn(
            'tabular mt-3 font-mono text-[clamp(5.25rem,26vw,12rem)] font-bold leading-none tracking-[-0.08em]',
            timerClasses[state],
            state === 'paused' && 'motion-safe:animate-pulse',
          )}
        >
          {formatClock(secondsLeft)}
        </div>
        {error && (
          <p role="alert" className="mt-5 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        {busy && <p role="status" className="mt-5 text-sm font-semibold text-muted">{t('referee.actionPending')}</p>}
      </main>

      {locked ? (
        <div className="border-t border-line pt-4 text-center">
          <p className="mb-3 text-sm font-semibold text-muted">{t('referee.controlsLocked')}</p>
          <Button
            size="big"
            className="w-full"
            {...holdHandlers(unlock)}
            autoFocus
            aria-label={t('referee.unlockHold')}
          >
            {unlock.holding ? t('referee.unlockHolding') : t('referee.unlockHold')}
          </Button>
        </div>
      ) : (
        <div className="border-t border-line pt-4">
          <div className="grid grid-cols-2 gap-3">
            {isFinishing ? (
              <>
                <Button
                  size="big"
                  variant="danger"
                  className="col-span-2"
                  {...holdHandlers(finish)}
                  disabled={busy || !onFinish}
                  aria-label={t('referee.finishHold')}
                >
                  {finish.holding ? t('referee.finishHolding') : t('referee.finishHold')}
                </Button>
                <Button size="big" className="col-span-2" onClick={onExtend} disabled={busy || !onExtend}>
                  {t('action.extendMinute')}
                </Button>
              </>
            ) : (
              <>
              <Button
                size="big"
                variant="primary"
                className="col-span-2"
                onClick={status === 'paused' ? onResume : onPause}
                disabled={busy || (status === 'paused' ? !onResume : !onPause)}
              >
                {status === 'paused' ? `▶ ${t('action.resume')}` : `⏸ ${t('action.pause')}`}
              </Button>
                <Button size="big" onClick={onExtend} disabled={busy || !onExtend}>
                  {t('action.extendMinute')}
                </Button>
                <Button
                  size="big"
                  variant="danger"
                  {...holdHandlers(finish)}
                  disabled={busy || !onFinish}
                  aria-label={t('referee.finishHold')}
                >
                  {finish.holding ? t('referee.finishHolding') : t('referee.finishHold')}
                </Button>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            className="mt-2 w-full min-h-[var(--touch-target-min)] border border-line text-[13px]"
            onClick={() => setLocked(true)}
            disabled={busy}
          >
            {t('referee.lockControls')}
          </Button>
        </div>
      )}
    </section>
  )
}
