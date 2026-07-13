import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'
import { useSessionActions } from '@/state/SessionActions'

/**
 * Single responsibility: the one queue-flow exception to the no-popup
 * policy (design.md §4) — requires explicit confirmation before "משחק חוזר"
 * creates two new queue entries. Opened from HistoryScreen's HistoryRow.
 */
export interface RematchConfirmDialogProps {
  open: boolean
  onClose: () => void
  matchId: string
  captainAName: string
  captainBName: string
}

export function RematchConfirmDialog({ open, onClose, matchId, captainAName, captainBName }: RematchConfirmDialogProps) {
  const actions = useSessionActions()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm(): Promise<void> {
    setSubmitting(true)
    setError(null)
    try {
      await actions.replay(matchId)
      onClose()
    } catch {
      setError(t('queue.actions.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('history.replayConfirm.title')}>
      <div className="flex flex-col gap-4">
        <p className="text-[15px]">
          {captainAName} <span className="text-muted">{t('match.vs')}</span> {captainBName}
        </p>
        {error && (
          <p role="alert" className="text-[13.5px] font-semibold text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button className="flex-1" onClick={onClose} disabled={submitting}>
            {t('history.replayConfirm.cancel')}
          </Button>
          <Button className="flex-1" variant="primary" onClick={() => void handleConfirm()} disabled={submitting}>
            {t('history.replayConfirm.confirm')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
