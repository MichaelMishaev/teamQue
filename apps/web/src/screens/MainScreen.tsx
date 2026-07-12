import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { FieldCard } from '@/components/FieldCard'
import { QueueList } from '@/components/QueueList'
import { QuickAddBar } from '@/components/QuickAddBar'
import { SessionSetupDialog } from '@/components/SessionSetupDialog'
import { showStatusToast } from '@/components/UndoToast'
import { t } from '@/i18n'
import { matchCountdownInput, type RunningStatus } from '@/lib/time'
import { useCountdown } from '@/hooks/useCountdown'
import { useCurrentStaff } from '@/state/AuthContext'
import { useSessionActions } from '@/state/SessionActions'
import { useSnapshot } from '@/state/SnapshotContext'

/**
 * Single responsibility: the app's hero screen (client-prd §3.1, design.md
 * §0) — one FieldCard (the live match, OR the front-two-of-the-line about
 * to kick off) above the line (count header + QueueList) above the sticky
 * QuickAddBar. The queue is a line of single teams — the front row is the
 * decision the manager is about to make (Mobbin "Up Next" pattern). Empty
 * states for no-session (manager gets the open-session CTA; staff gets a
 * waiting note) and empty-line. Top bar/tabs/clock live in App.tsx — shared
 * chrome, not MainScreen's responsibility.
 */
export function MainScreen() {
  const { snapshot, offsetMs } = useSnapshot()
  const actions = useSessionActions()
  const currentStaff = useCurrentStaff()
  const [error, setError] = useState<string | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)

  const field = snapshot?.fields[0] ?? null
  const liveMatch = field?.liveMatch ?? null
  const isRunning = liveMatch !== null && (liveMatch.status === 'live' || liveMatch.status === 'paused')
  const countdownInput = isRunning && liveMatch ? matchCountdownInput(liveMatch) : { endsAtMs: null, pausedRemainingSec: null }
  const secondsLeft = useCountdown({ ...countdownInput, offsetMs })

  if (!snapshot) {
    const isManager = currentStaff?.role === 'manager'
    return (
      <div className="p-4">
        <EmptyState
          icon="⚽"
          title={t('empty.noSession.title')}
          hint={isManager ? t('empty.noSession.hint') : t('empty.noSession.staffHint')}
          action={
            isManager ? (
              <Button variant="primary" className="min-w-44" onClick={() => setSetupOpen(true)}>
                {t('empty.noSession.cta')}
              </Button>
            ) : undefined
          }
        />
        {isManager && <SessionSetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />}
      </div>
    )
  }

  if (!field) return null // defensive: session active implies a field exists (mock/API invariant)

  async function withErrorHandling(action: () => Promise<unknown>): Promise<void> {
    try {
      await action()
    } catch {
      setError(t('queue.actions.error'))
    }
  }

  async function handleFinish(matchId: string): Promise<void> {
    try {
      await actions.finish(matchId)
      showStatusToast('toast.matchFinished')
    } catch {
      setError(t('queue.actions.error'))
    }
  }

  const frontTwo = snapshot.queue.slice(0, 2)
  const nextTwo = frontTwo.length === 2 ? { teamA: frontTwo[0]!.team.name, teamB: frontTwo[1]!.team.name } : undefined

  return (
    <>
      <div className="flex flex-col gap-4 p-4">
        {error && (
          <p role="alert" className="text-[13.5px] font-semibold text-danger">
            {error}
          </p>
        )}

        {isRunning && liveMatch ? (
          <FieldCard
            status={liveMatch.status as RunningStatus}
            fieldName={field.name}
            captainA={liveMatch.captainA.name}
            captainB={liveMatch.captainB.name}
            secondsLeft={secondsLeft}
            onPause={() => void withErrorHandling(() => actions.pause(liveMatch.id))}
            onResume={() => void withErrorHandling(() => actions.resume(liveMatch.id))}
            onExtend={() => void withErrorHandling(() => actions.extend(liveMatch.id))}
            onFinish={() => void handleFinish(liveMatch.id)}
          />
        ) : (
          <FieldCard
            status="free"
            fieldName={field.name}
            {...(nextTwo ? { nextTwo } : {})}
            onStart={() => void withErrorHandling(() => actions.startMatch())}
          />
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
            {t('queue.header', { count: snapshot.queue.length })}
          </h2>
          {snapshot.queue.length === 0 ? <EmptyState title={t('empty.queue')} /> : <QueueList queue={snapshot.queue} onError={setError} />}
        </section>
      </div>

      <QuickAddBar />
    </>
  )
}
