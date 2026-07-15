import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'

/**
 * Single responsibility: the one exception (besides RematchConfirmDialog) to
 * the no-popup policy (design.md §4) — requires explicit confirmation before
 * a pair drag-and-drop (docs/superpowers/specs/2026-07-13-queue-pair-move-
 * design.md) commits, since staff running the line are non-technical and a
 * drag can shift several pairs' positions at once
 * (docs/superpowers/specs/2026-07-15-pair-switch-confirm-design.md). Unlike
 * RematchConfirmDialog, there's no submitting/error state here — QueueList
 * already applies every reorder optimistically and reverts on failure, so
 * Confirm just closes this dialog and lets that existing path run.
 */
export interface PairSwitchConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  /** The dragged pair's team names, e.g. ["יוסי", "רון"]. */
  groupANames: string[]
  direction: 'up' | 'down'
  /** The one pair displaced by an adjacent (1-slot) move — null for a multi-slot move. */
  occupantNames: string[] | null
  /** How many other pairs shift by one slot — only shown when occupantNames is null. */
  shiftCount: number
}

export function PairSwitchConfirmDialog({
  open,
  onConfirm,
  onCancel,
  groupANames,
  direction,
  occupantNames,
  shiftCount,
}: PairSwitchConfirmDialogProps) {
  const groupA = groupANames.join(' / ')
  const title = occupantNames
    ? t('queue.pairSwitch.confirmAdjacent', { groupA, groupB: occupantNames.join(' / ') })
    : direction === 'up'
      ? t('queue.pairSwitch.confirmMultiUp', { groupA, count: shiftCount })
      : t('queue.pairSwitch.confirmMultiDown', { groupA, count: shiftCount })

  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <div className="flex gap-3">
        <Button className="flex-1" onClick={onCancel}>
          {t('queue.pairSwitch.cancel')}
        </Button>
        <Button className="flex-1" variant="primary" onClick={onConfirm}>
          {t('queue.pairSwitch.confirm')}
        </Button>
      </div>
    </Dialog>
  )
}
