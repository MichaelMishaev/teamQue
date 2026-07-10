import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Single responsibility: the state color language chip — live/paused/ending/free (design.md §1). */

export type BadgeState = 'live' | 'paused' | 'ending' | 'free'

const stateClasses: Record<BadgeState, string> = {
  live: 'bg-accent-dim text-accent',
  paused: 'bg-warn/15 text-warn',
  ending: 'bg-danger/15 text-danger',
  free: 'bg-surface-2 text-muted',
}

export function Badge({ state, children, className }: { state: BadgeState; children: ReactNode; className?: string }) {
  return (
    <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide', stateClasses[state], className)}>
      {children}
    </span>
  )
}
