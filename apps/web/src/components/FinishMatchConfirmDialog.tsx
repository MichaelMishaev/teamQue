import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { t } from '@/i18n'

/** Single responsibility: confirm the destructive manual-finish action. */
export interface FinishMatchConfirmDialogProps {
  open: boolean
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function FinishMatchConfirmDialog({ open, submitting, onConfirm, onCancel }: FinishMatchConfirmDialogProps) {
  function handleClose(): void {
    if (!submitting) onCancel()
  }

  return (
    <Dialog open={open} onClose={handleClose} title={t('field.finishConfirm.title')}>
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-muted">{t('field.finishConfirm.message')}</p>
        <div className="flex gap-3">
          <Button className="flex-1" onClick={onCancel} disabled={submitting}>
            {t('field.finishConfirm.cancel')}
          </Button>
          <Button className="flex-1" variant="danger" onClick={onConfirm} disabled={submitting}>
            {t('field.finishConfirm.confirm')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
