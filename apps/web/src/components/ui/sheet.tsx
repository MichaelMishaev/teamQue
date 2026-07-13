import { useEffect, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useFocusTrap } from '@/hooks/useFocusTrap'

/**
 * Single responsibility: the app's one bottom-sheet primitive (no-popup
 * policy, design.md §4) — fixed overlay + panel sliding from the block-end
 * edge, closes on overlay tap/Escape. No Radix dependency; a basic focus
 * trap keeps it accessible. Used for QueueActionsSheet, CaptainSheet, SwitchUser.
 */
export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export function Sheet({ open, onClose, title, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(open, onClose, panelRef)

  useEffect(() => {
    // An undo/status toast (sonner, bottom-center, very high z-index) sits on
    // the same screen edge this panel slides from — without dismissing it, it
    // paints over the panel's bottom-most action row (gh#1).
    if (open) toast.dismiss()
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-t-2xl border-t border-line bg-surface p-4 outline-none"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {title && <h2 className="mb-3 text-[19px] font-bold">{title}</h2>}
        {children}
      </div>
    </div>
  )
}
