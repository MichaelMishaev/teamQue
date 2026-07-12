import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Single responsibility: visually groups the 1-2 QueueRows of one predicted
 * pair inside a single shared card — the shape carries the "these two play
 * each other" meaning, not color or text alone (see
 * docs/superpowers/specs/2026-07-13-queue-pairing-and-eta-design.md, which
 * documents why an earlier text-only version was rejected). The label sits
 * in normal flow above the card, never absolutely positioned over its
 * border, so it can never be clipped by the card's rounded corners.
 */
export type QueuePairGroupVariant = 'next' | 'default' | 'solo'

export interface QueuePairGroupProps {
  label: string
  variant: QueuePairGroupVariant
  children: ReactNode
}

export function QueuePairGroup({ label, variant, children }: QueuePairGroupProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={cn('px-1 text-[12px] font-semibold text-muted', variant === 'next' && 'text-accent')}>
        {label}
      </span>
      <div
        className={cn(
          'flex flex-col rounded-xl border border-line bg-surface [&>*+*]:border-t [&>*+*]:border-line',
          variant === 'next' && 'border-accent [&>*+*]:border-accent-dim',
          variant === 'solo' && 'border-dashed',
        )}
      >
        {children}
      </div>
    </div>
  )
}
