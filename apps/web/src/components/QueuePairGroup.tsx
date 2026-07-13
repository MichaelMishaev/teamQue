import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { t } from '@/i18n'
import { cn } from '@/lib/cn'

/**
 * Single responsibility: visually groups the 1-2 QueueRows of one predicted
 * pair inside a single shared card — the shape carries the "these two play
 * each other" meaning, not color or text alone (see
 * docs/superpowers/specs/2026-07-13-queue-pairing-and-eta-design.md, which
 * documents why an earlier text-only version was rejected). The label sits
 * in normal flow above the card, never absolutely positioned over its
 * border, so it can never be clipped by the card's rounded corners.
 *
 * Pair (non-solo) variants also render a grip handle used by the
 * double-tap-and-hold-to-drag gesture that moves the whole pair
 * (docs/superpowers/specs/2026-07-13-queue-pair-move-design.md) — the
 * gesture's timers and DOM drag mechanics live in QueueList; this component
 * only renders the handle, reports pointerdown, and reflects gripState.
 */
export type QueuePairGroupVariant = 'next' | 'default' | 'solo'
export type PairGripState = 'idle' | 'armed' | 'holding'

export interface QueuePairGroupProps {
  label: string
  variant: QueuePairGroupVariant
  children: ReactNode
  /** DOM identity used by QueueList's imperative drag code (getBoundingClientRect lookups). */
  groupId?: string
  gripState?: PairGripState
  onGripPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  /** Passed through to the root element — used by QueueList to apply a live-drag reflow transform. */
  style?: CSSProperties
}

export function QueuePairGroup({
  label,
  variant,
  children,
  groupId,
  gripState = 'idle',
  onGripPointerDown,
  style,
}: QueuePairGroupProps) {
  return (
    <div className="flex flex-col gap-1.5" data-group-id={groupId} style={style}>
      <div className="flex items-center gap-1">
        {variant !== 'solo' && (
          <button
            type="button"
            onPointerDown={onGripPointerDown}
            aria-label={t('queue.pair.gripLabel', { label })}
            className={cn(
              'flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] touch-none items-center justify-center rounded-lg',
              gripState === 'armed' && 'bg-warn/10',
              gripState === 'holding' && 'bg-accent-dim/20',
            )}
          >
            <span className="grid grid-cols-2 grid-rows-3 gap-[3px]" aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-[3px] w-[3px] rounded-full bg-muted',
                    gripState === 'armed' && 'bg-warn',
                    gripState === 'holding' && 'bg-accent',
                  )}
                />
              ))}
            </span>
          </button>
        )}
        <span className={cn('px-1 text-[12px] font-semibold text-muted', variant === 'next' && 'text-accent')}>
          {label}
        </span>
      </div>
      {/* overflow-hidden clips the QueueRow's flat bg-accent-dim/20 "next" background so it doesn't leak past our rounded corners */}
      <div
        className={cn(
          'flex flex-col overflow-hidden rounded-xl border border-line bg-surface [&>*+*]:border-t [&>*+*]:border-line',
          variant === 'next' && 'border-accent [&>*+*]:border-accent-dim',
          variant === 'solo' && 'border-dashed',
        )}
      >
        {children}
      </div>
    </div>
  )
}
