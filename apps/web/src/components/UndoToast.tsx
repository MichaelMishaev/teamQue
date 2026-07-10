import { toast, Toaster } from 'sonner'
import { t, type MessageKey } from '@/i18n'

/**
 * Single responsibility: the undo-instead-of-confirm mechanism (design.md §4).
 * Mount <UndoToaster/> once; call showUndoToast after any destructive action.
 */

export const UNDO_WINDOW_MS = 5_000

export function UndoToaster() {
  return (
    <Toaster
      position="bottom-center"
      theme="dark"
      dir="rtl"
      toastOptions={{
        style: {
          background: 'var(--green-800)',
          border: '1px solid var(--green-700)',
          color: 'var(--gray-100)',
        },
      }}
    />
  )
}

export function showUndoToast(messageKey: MessageKey, onUndo: () => void, durationMs: number = UNDO_WINDOW_MS): void {
  toast(t(messageKey), {
    duration: durationMs,
    action: { label: t('action.undo'), onClick: onUndo },
  })
}
