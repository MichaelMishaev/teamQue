import { t } from '@/i18n'
import { cn } from '@/lib/cn'

/**
 * Single responsibility: a selected-captain slot in quick-add — keeps games-today
 * visible after selection (fairness surface, product PRD §13).
 */

export type CaptainChipProps =
  | { empty: true }
  | { empty?: false; name: string; gamesToday: number; onRemove?: () => void }

export function CaptainChip(props: CaptainChipProps) {
  if (props.empty) {
    return (
      <span className="flex min-h-[var(--touch-target-min)] items-center rounded-full border border-dashed border-line bg-surface-2 px-3.5 text-[14.5px] font-semibold text-muted">
        {t('captain.emptySlot')}
      </span>
    )
  }
  return (
    <span className={cn('flex min-h-[var(--touch-target-min)] items-center gap-1.5 rounded-full bg-accent-dim px-3.5 text-[14.5px] font-semibold text-accent')}>
      {props.name}
      <small className="font-normal opacity-75">{t('captain.todayShort', { count: props.gamesToday })}</small>
      {props.onRemove && (
        <button type="button" onClick={props.onRemove} aria-label={t('queue.remove')} className="ps-1 text-xs opacity-70">
          ✕
        </button>
      )}
    </span>
  )
}
