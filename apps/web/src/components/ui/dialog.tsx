import { useRef, type ReactNode } from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

/**
 * Single responsibility: the app's one centered-dialog primitive — used only
 * for the 3 flows the no-popup policy allows (session setup, settings,
 * staff management; design.md §4). Same hand-rolled overlay approach as
 * Sheet, centered instead of anchored to the block-end edge.
 */
export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(open, onClose, panelRef)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-2xl border border-line bg-surface p-4 outline-none"
      >
        {title && <h2 className="mb-3 text-[19px] font-bold">{title}</h2>}
        {children}
      </div>
    </div>
  )
}
