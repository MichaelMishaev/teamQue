import type { HTMLAttributes } from 'react'
import { t } from '@/i18n'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'

/**
 * Single responsibility: one line row — a SINGLE waiting team (design.md §0:
 * the queue is a line of single teams, never "A vs B"). Position, drag
 * handle, ⋯ menu trigger; games-today is the inline fairness surface.
 * dnd-kit listeners attach via handleProps at the screen level; this stays
 * presentational. When rendered inside a QueuePairGroup (`grouped`), this
 * row omits its own border/background/radius — the group supplies them —
 * except while dragging or removing, when it pops back to a standalone card.
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
  /** Rendered inside a QueuePairGroup — omit this row's own border/background/radius; the group supplies them. */
  grouped?: boolean
  /** Full pairs ahead of this one. Omit entirely to hide the estimate line (used for the front pair). */
  gamesAhead?: number
  /** Estimated seconds from now until this pair's match starts. Paired with gamesAhead. */
  etaSec?: number
  /** True for the trailing entry with no confirmed opponent yet — appends "(משוער)". */
  etaApprox?: boolean
  onMenu?: () => void
  handleProps?: HTMLAttributes<HTMLSpanElement>
}

export function QueueRow({
  position,
  teamName,
  nickname,
  gamesToday,
  lastPlayedAt,
  next,
  dragging,
  removing,
  grouped,
  gamesAhead,
  etaSec,
  etaApprox,
  onMenu,
  handleProps,
}: QueueRowProps) {
  const standalone = !grouped || dragging || removing
  return (
    <div
      className={cn(
        'flex min-h-[var(--queuerow-min-height)] items-center gap-3 px-3.5 py-3',
        standalone && 'rounded-xl border border-line bg-surface',
        next && standalone && 'border-accent bg-accent-dim/40',
        next && !standalone && 'bg-accent-dim/20',
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
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-[17px] font-semibold">
          {teamName}
          {nickname && <small className="ms-1 font-normal text-muted">({nickname})</small>}
        </span>
        {gamesAhead !== undefined && etaSec !== undefined && (
          <small className="flex items-center gap-1 font-normal text-accent">
            <span>{gamesAhead === 1 ? t('queue.pair.gamesAheadOne') : t('queue.pair.gamesAheadMany', { count: gamesAhead })}</span>
            <span>·</span>
            <span>{t('queue.pair.etaPrefix')}</span>
            <bdi className="tabular font-mono">{Math.round(etaSec / 60)}</bdi>
            <span>{t('queue.pair.etaSuffixMinutes')}</span>
            {etaApprox && <span>{t('queue.pair.etaApprox')}</span>}
          </small>
        )}
        {gamesToday > 0 && (
          <small className="font-normal text-muted">
            <span>{t('captain.todayShort', { count: gamesToday })}</span>
            {lastPlayedAt && (
              <>
                {' · '}
                <bdi className="tabular font-mono">{lastPlayedAt}</bdi>
              </>
            )}
          </small>
        )}
      </div>
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
