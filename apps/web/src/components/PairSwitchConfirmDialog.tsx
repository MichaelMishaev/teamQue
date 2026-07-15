import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { t, type MessageKey } from '@/i18n'

/**
 * Single responsibility: the one exception (besides RematchConfirmDialog) to
 * the no-popup policy (design.md §4) — requires explicit confirmation before
 * a queue reorder commits, since staff running the line are non-technical
 * and a reorder can shift several other entries' positions at once. Three
 * callers share this dialog: the pair-grip drag (`unit="pair"`,
 * docs/superpowers/specs/2026-07-15-pair-switch-confirm-design.md), the
 * single-row ☰ drag (`unit="team"`,
 * docs/superpowers/specs/2026-07-15-row-switch-confirm-design.md), and the
 * ⋯-menu move-to-top/bottom (`unit="team"`, since it moves one entry like
 * the row drag does, docs/superpowers/specs/2026-07-15-move-end-confirm-
 * design.md). There's no submitting/error state here, unlike
 * RematchConfirmDialog — each caller owns applying its own action (with or
 * without local optimism) and reverting on failure; Confirm just closes
 * this dialog and lets the caller's own path run.
 */
export interface PairSwitchConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  /** The dragged pair's (or single row's) name(s), e.g. ["יוסי", "רון"] or ["יוסי"]. */
  groupANames: string[]
  direction: 'up' | 'down'
  /** The one pair/row displaced by an adjacent (1-slot) move — null for a multi-slot move. */
  occupantNames: string[] | null
  /** How many other pairs/rows shift by one slot — only shown when occupantNames is null. */
  shiftCount: number
  /** Selects which multi-shift i18n keys to use ("זוגות" vs "קבוצות") when occupantNames is null. */
  unit: 'pair' | 'team'
}

export function PairSwitchConfirmDialog({
  open,
  onConfirm,
  onCancel,
  groupANames,
  direction,
  occupantNames,
  shiftCount,
  unit,
}: PairSwitchConfirmDialogProps) {
  const groupA = groupANames.join(' / ')
  const multiKey: MessageKey =
    unit === 'pair'
      ? direction === 'up'
        ? 'queue.pairSwitch.confirmMultiUp'
        : 'queue.pairSwitch.confirmMultiDown'
      : direction === 'up'
        ? 'queue.rowSwitch.confirmMultiUp'
        : 'queue.rowSwitch.confirmMultiDown'
  const title = occupantNames
    ? t('queue.pairSwitch.confirmAdjacent', { groupA, groupB: occupantNames.join(' / ') })
    : t(multiKey, { groupA, count: shiftCount })

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
