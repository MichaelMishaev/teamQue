import { t } from '@/i18n'
import { Button } from '@/components/ui/button'

/**
 * Single responsibility: one quick-add search hit — name + the fairness stats line,
 * zero extra taps (US-020). Also the create-new row with duplicate soft hint (US-021/022).
 */

export interface CaptainHitProps {
  name: string
  nickname?: string
  gamesToday: number
  lastPlayedAt?: string
  onSelect?: () => void
}

export function CaptainSearchResult({ name, nickname, gamesToday, lastPlayedAt, onSelect }: CaptainHitProps) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-2 py-3 last:border-b-0">
      <span className="flex size-9.5 shrink-0 items-center justify-center rounded-full bg-accent-dim font-bold text-accent">
        {name.charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15.5px] font-semibold">
          {name}
          {nickname && <small className="ms-1 font-normal text-muted">({nickname})</small>}
        </div>
        <div className="text-[12.5px] text-muted">
          {gamesToday > 0 ? (
            <>
              <span className="text-warn">{t('captain.gamesToday', { count: gamesToday })}</span>
              {lastPlayedAt && <> · {t('captain.lastPlayed')} <bdi className="tabular font-mono">{lastPlayedAt}</bdi></>}
            </>
          ) : (
            t('captain.neverPlayedToday')
          )}
        </div>
      </div>
      {onSelect && (
        <Button onClick={onSelect} className="min-h-12 shrink-0 px-5">
          {t('action.choose')}
        </Button>
      )}
    </div>
  )
}

export function CreateCaptainRow({ name, duplicate, onCreate }: { name: string; duplicate?: boolean; onCreate?: () => void }) {
  return (
    <button
      type="button"
      onClick={onCreate}
      className="flex w-full items-center gap-3 px-2 py-3 text-start"
    >
      <span className="flex size-9.5 shrink-0 items-center justify-center rounded-full bg-surface-2 font-bold text-muted">+</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-semibold">{t('captain.createAndAdd', { name })}</span>
        <span className="block text-[12.5px] text-muted">
          {duplicate ? <span className="text-warn">⚠ {t('captain.duplicateHint', { name })}</span> : t('captain.createHint')}
        </span>
      </span>
    </button>
  )
}
