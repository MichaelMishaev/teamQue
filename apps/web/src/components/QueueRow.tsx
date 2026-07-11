import type { HTMLAttributes } from 'react'
import { t } from '@/i18n'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'

/**
 * Single responsibility: one line row — a SINGLE waiting team (design.md §0:
 * the queue is a line of single teams, never "A vs B"). Position, drag
 * handle, ⋯ menu trigger; games-today is the inline fairness surface.
 * dnd-kit listeners attach via handleProps at the screen level; this stays
 * presentational.
 */

export interface QueueRowProps {
  position: number
  teamName: string
  nickname?: string
  gamesToday: number
  lastPlayedAt?: string
  /** Front of the line — the decision the manager is about to make. Gets the accent treatment. */
  next?: boolean
  dragging?: boolean
  removing?: boolean
  onMenu?: () => void
  handleProps?: HTMLAttributes<HTMLSpanElement>
}

export function QueueRow({ position, teamName, nickname, gamesToday, lastPlayedAt, next, dragging, removing, onMenu, handleProps }: QueueRowProps) {
  return (
    <div
      className={cn(
        'flex min-h-[var(--queuerow-min-height)] items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3',
        next && 'border-accent bg-accent-dim/40',
        dragging && 'rotate-[0.6deg] scale-[1.02] border-accent shadow-xl shadow-black/70',
        removing && 'border-danger',
      )}
    >
      <span
        className="cursor-grab touch-none text-[19px] tracking-tighter text-muted"
        aria-hidden
        {...handleProps}
      >
        ≡
      </span>
      {next ? (
        <Badge state="live">{t('queue.next')}</Badge>
      ) : (
        <span dir="ltr" className="tabular min-w-4 text-center font-mono text-sm text-muted">{position}</span>
      )}
      <span className="flex-1 text-[17px] font-semibold">
        {teamName}
        {nickname && <small className="ms-1 font-normal text-muted">({nickname})</small>}
        {gamesToday > 0 && (
          <small className="ms-1 font-normal text-muted">
            <span>{t('captain.todayShort', { count: gamesToday })}</span>
            {lastPlayedAt && (
              <>
                {' · '}
                <bdi className="tabular font-mono">{lastPlayedAt}</bdi>
              </>
            )}
          </small>
        )}
      </span>
      {removing ? (
        <span className="text-[13px] font-bold text-danger">{t('queue.remove')}</span>
      ) : (
        <button
          type="button"
          onClick={onMenu}
          aria-label={teamName}
          className="-me-2.5 flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] items-center justify-center text-[19px] text-muted"
        >
          ⋯
        </button>
      )}
    </div>
  )
}
