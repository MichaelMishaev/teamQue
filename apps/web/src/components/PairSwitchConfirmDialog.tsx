import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'

/**
 * Single responsibility: the one exception (besides RematchConfirmDialog) to
 * the no-popup policy (design.md §4) — requires explicit confirmation before
 * a queue reorder commits, since staff running the line are non-technical
 * and a reorder can shift several other entries' positions at once. Always
 * names two specific entities — the one moved and whichever one lands in its
 * exact original slot — even for a move spanning several other entries in
 * between, which shift silently
 * (docs/superpowers/specs/2026-07-15-swap-partner-naming-design.md). Three
 * callers share this dialog: the pair-grip drag, the single-row ☰ drag, and
 * the ⋯-menu move-to-top/bottom. There's no submitting/error state here,
 * unlike RematchConfirmDialog — each caller owns applying its own action
 * (with or without local optimism) and reverting on failure; Confirm just
 * closes this dialog and lets the caller's own path run.
 */
export interface PairSwitchConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  /** The moved pair's (or single row's) name(s), e.g. ["יוסי", "רון"] or ["יוסי"]. */
  groupANames: string[]
  /** The pair/row now sitting in groupANames' original slot — always present. */
  occupantNames: string[]
}

export function PairSwitchConfirmDialog({ open, onConfirm, onCancel, groupANames, occupantNames }: PairSwitchConfirmDialogProps) {
  const title = t('queue.pairSwitch.confirmSwap', { groupA: groupANames.join(' / '), groupB: occupantNames.join(' / ') })

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
