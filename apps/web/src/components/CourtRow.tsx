import { Badge } from '@/components/ui/badge'
import { t } from '@/i18n'
import independenceSquareEvening from '@/assets/independence-square-evening.webp'
import { DEFAULT_FIELD_NAME, type FieldListItem } from 'shared'

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
  const isDefaultCourt = court.name === DEFAULT_FIELD_NAME

  return (
    <button
      type="button"
      onClick={() => onOpen(court.slug)}
      className="group w-full overflow-hidden rounded-xl border border-line bg-surface text-start transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-bg"
    >
      {isDefaultCourt && (
        <span className="relative block aspect-[3.4/1] overflow-hidden border-b border-line bg-bg">
          <img src={independenceSquareEvening} alt={t('home.court.defaultImageAlt')} className="h-full w-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-t from-bg/95 via-bg/20 to-transparent" aria-hidden="true" />
          <span className="absolute inset-x-3 bottom-3 text-[20px] font-bold text-ink">{court.name}</span>
        </span>
      )}

      <span className="block p-3">
        <span className="flex items-start justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            {!isDefaultCourt && <span className="text-[15.5px] font-semibold text-ink">{court.name}</span>}
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
        </span>

        <span className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-[13px] font-bold text-accent">
          <span>{isDefaultCourt ? t('home.court.defaultEnterHint') : t('home.court.open')}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-5 transition-transform group-active:-translate-x-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </span>
      </span>
    </button>
  )
}
