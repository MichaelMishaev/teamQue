import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'

/**
 * Single responsibility: the one exception (besides RematchConfirmDialog) to
 * the no-popup policy (design.md §4) — requires explicit confirmation before
 * a queue reorder commits, since staff running the line are non-technical
 * and a reorder can shift several other entries' positions at once. Always
 * names every entity the move actually displaces — never a bare count —
 * whether that's the one entity of an adjacent swap or several for a
 * multi-slot move (docs/superpowers/specs/2026-07-15-swap-partner-naming-
 * design.md). Three callers share this dialog: the pair-grip drag
 * (docs/superpowers/specs/2026-07-15-pair-switch-confirm-design.md), the
 * single-row ☰ drag (docs/superpowers/specs/2026-07-15-row-switch-confirm-
 * design.md), and the ⋯-menu move-to-top/bottom
 * (docs/superpowers/specs/2026-07-15-move-end-confirm-design.md). There's no
 * submitting/error state here, unlike RematchConfirmDialog — each caller
 * owns applying its own action (with or without local optimism) and
 * reverting on failure; Confirm just closes this dialog and lets the
 * caller's own path run.
 */
export interface PairSwitchConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  /** The dragged pair's (or single row's) name(s), e.g. ["יוסי", "רון"] or ["יוסי"]. */
  groupANames: string[]
  direction: 'up' | 'down'
  /**
   * Every entity this move displaces, in original queue order — always at
   * least one group. Each inner array is one displaced row's or pair's
   * name(s) (1 for a solo row, up to 2 for a pair) — grouped, not flattened,
   * so a single displaced pair (two names) still reads as one entity for
   * choosing between the two-way "⇄" phrasing and the multi-shift phrasing.
   */
  displaced: string[][]
}

export function PairSwitchConfirmDialog({ open, onConfirm, onCancel, groupANames, direction, displaced }: PairSwitchConfirmDialogProps) {
  const groupA = groupANames.join(' / ')
  const title =
    displaced.length === 1
      ? t('queue.pairSwitch.confirmAdjacent', { groupA, groupB: (displaced[0] ?? []).join(' / ') })
      : t(direction === 'up' ? 'queue.pairSwitch.confirmMultiUp' : 'queue.pairSwitch.confirmMultiDown', {
          groupA,
          names: displaced.map((g) => g.join(' / ')).join(', '),
        })

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
