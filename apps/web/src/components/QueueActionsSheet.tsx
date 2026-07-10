import { useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { showUndoToast } from '@/components/UndoToast'
import { t } from '@/i18n'
import { cn } from '@/lib/cn'
import type { QueueEntryView } from 'shared'
import { useSessionActions } from '@/state/SessionActions'

/**
 * Single responsibility: the line row ⋯ menu (client-prd §3.1, task brief
 * item 5) — rename, move top/bottom, remove (undo toast, no confirm dialog).
 * "Change captains" is dropped (single-team rows have nothing to swap) and
 * replay lives on finished matches in HistoryScreen, not here. Screen-level
 * composition: talks to SessionActions directly (design.md §5).
 */
export interface QueueActionsSheetProps {
  open: boolean
  onClose: () => void
  entry: QueueEntryView
  onError?: (message: string) => void
}

export function QueueActionsSheet({ open, onClose, entry, onError }: QueueActionsSheetProps) {
  const actions = useSessionActions()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(entry.team.name)

  useEffect(() => {
    setName(entry.team.name)
  }, [entry.team.id, entry.team.name])

  function reportError(): void {
    onError?.(t('queue.actions.error'))
  }

  async function handleRenameBlur(): Promise<void> {
    setRenaming(false)
    const trimmed = name.trim()
    if (!trimmed || trimmed === entry.team.name) return
    try {
      await actions.updateTeam(entry.team.id, { name: trimmed })
    } catch {
      reportError()
    }
  }

  async function handleMoveTop(): Promise<void> {
    try {
      await actions.moveTop(entry.id)
      onClose()
    } catch {
      reportError()
    }
  }

  async function handleMoveBottom(): Promise<void> {
    try {
      await actions.moveBottom(entry.id)
      onClose()
    } catch {
      reportError()
    }
  }

  async function handleRemove(): Promise<void> {
    try {
      const { activityId } = await actions.removeFromLine(entry.id)
      onClose()
      showUndoToast('toast.removedFromQueue', () => {
        void actions.undo(activityId)
      })
    } catch {
      reportError()
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={entry.team.name}>
      <div className="flex flex-col gap-1">
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void handleRenameBlur()}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="min-h-[var(--touch-target-min)] rounded-xl border border-line bg-surface-2 px-3 text-[16px] text-ink outline-none"
          />
        ) : (
          <>
            <SheetAction label={t('queue.actions.rename')} onClick={() => setRenaming(true)} />
            <SheetAction label={t('queue.actions.moveTop')} onClick={() => void handleMoveTop()} />
            <SheetAction label={t('queue.actions.moveBottom')} onClick={() => void handleMoveBottom()} />
            <SheetAction label={t('queue.remove')} danger onClick={() => void handleRemove()} />
          </>
        )}
      </div>
    </Sheet>
  )
}

function SheetAction({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[var(--touch-target-min)] items-center rounded-xl px-3 text-start text-[16px] font-semibold',
        danger ? 'text-danger' : 'text-ink',
      )}
    >
      {label}
    </button>
  )
}
