import type { ReactNode } from 'react'

/** Single responsibility: dashed empty placeholder — no session / empty queue (client-prd mock). */

export function EmptyState({ icon, title, hint, action }: {
  icon?: string
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-line p-5 text-center text-sm text-muted">
      {icon && <div className="text-[26px]" aria-hidden>{icon}</div>}
      <div className="font-semibold text-ink">{title}</div>
      {hint && <div className="text-[13px]">{hint}</div>}
      {action}
    </div>
  )
}
