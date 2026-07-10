import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'
import { useSessionActions } from '@/state/SessionActions'

/**
 * Single responsibility: one of the 3 allowed dialogs (design.md §4) —
 * duration stepper + "פתח ערב" (US-010). Opened from MainScreen's no-session
 * empty state (manager) and from SettingsScreen.
 */
export interface SessionSetupDialogProps {
  open: boolean
  onClose: () => void
}

const MIN_MINUTES = 1
const MAX_MINUTES = 60
const DEFAULT_MINUTES = 6

export function SessionSetupDialog({ open, onClose }: SessionSetupDialogProps) {
  const actions = useSessionActions()
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleOpen(): Promise<void> {
    setSubmitting(true)
    setError(null)
    try {
      await actions.openSession({ matchDurationSec: minutes * 60 })
      onClose()
    } catch {
      setError(t('session.setup.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('session.setup.title')}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] text-muted">{t('session.setup.duration')}</span>
          <div className="flex items-center gap-3">
            <Button onClick={() => setMinutes((m) => Math.max(MIN_MINUTES, m - 1))} aria-label={t('session.setup.decrease')}>
              −
            </Button>
            <span className="tabular w-14 text-center text-[19px] font-bold" dir="ltr">
              {minutes}:00
            </span>
            <Button onClick={() => setMinutes((m) => Math.min(MAX_MINUTES, m + 1))} aria-label={t('session.setup.increase')}>
              +
            </Button>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-[13.5px] font-semibold text-danger">
            {error}
          </p>
        )}
        <Button variant="primary" size="big" onClick={() => void handleOpen()} disabled={submitting}>
          {t('session.setup.open')}
        </Button>
      </div>
    </Dialog>
  )
}
