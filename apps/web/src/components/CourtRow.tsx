import { Badge } from '@/components/ui/badge'
import { t } from '@/i18n'
import type { FieldListItem } from 'shared'

/**
 * Single responsibility: one tappable court row on the home list ('/') — court
 * name plus its live/queue state, opening that court's queue on tap. Purely
 * presentational; the GET /fields row is the only state source.
 */
export interface CourtRowProps {
  court: FieldListItem
  onOpen: (slug: string) => void
}

export function CourtRow({ court, onOpen }: CourtRowProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(court.slug)}
      className="flex min-h-[var(--btn-height-big)] w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-start"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-[15.5px] font-semibold text-ink">{court.name}</span>
        <span className="text-[13px] text-muted">
          <bdi className="tabular" dir="ltr">
            {court.queueLength}
          </bdi>{' '}
          {t('home.court.inQueue')}
        </span>
      </span>
      <Badge state={court.hasLiveMatch ? 'live' : 'free'}>
        {court.hasLiveMatch ? t('field.state.live') : t('field.state.free')}
      </Badge>
    </button>
  )
}
