import { useState } from 'react'
import type { FinishedMatchView } from '@/state/HistoryContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { RematchConfirmDialog } from '@/components/RematchConfirmDialog'
import { SessionSummaryCard } from '@/components/SessionSummaryCard'
import { t } from '@/i18n'
import { cn } from '@/lib/cn'
import { formatClock, formatTimeOfDay } from '@/lib/time'
import { useHistory } from '@/state/HistoryContext'

/**
 * Single responsibility: read-only session history (client-prd §3.3,
 * US-070/073) — summary header above the finished-match list, searchable by
 * captain name. Each row also offers "משחק חוזר" (replay), which re-adds
 * both of that match's teams to the back of the line — replay lives here,
 * not on the line's ⋯ menu (task brief item 5), since it operates on a
 * finished match, not a waiting line entry.
 */
export function HistoryScreen() {
  const { summary, matches } = useHistory()
  const [query, setQuery] = useState('')

  const q = query.trim()
  const filtered = q ? matches.filter((m) => m.captainA.name.includes(q) || m.captainB.name.includes(q)) : matches

  return (
    <div className="flex flex-col gap-4 p-4">
      {summary && <SessionSummaryCard summary={summary} />}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('history.searchPlaceholder')}
        className="min-h-[var(--touch-target-min)] rounded-xl border border-line bg-surface-2 px-3 text-[15px] outline-none"
      />

      {filtered.length === 0 ? (
        <EmptyState title={t('history.empty')} />
      ) : (
        <div className="rounded-xl border border-line bg-surface">
          {filtered.map((m) => (
            <HistoryRow key={m.id} match={m} />
          ))}
        </div>
      )}
    </div>
  )
}

function HistoryRow({ match }: { match: FinishedMatchView }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const delta = match.actualDurationSec !== match.plannedDurationSec

  return (
    <div className="flex flex-col gap-1 border-b border-line px-3 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-semibold">
          {match.captainA.name} <span className="text-[13px] font-normal text-muted">{t('match.vs')}</span> {match.captainB.name}
        </span>
        <Badge state={match.endReason === 'auto' ? 'free' : 'live'}>
          {match.endReason === 'auto' ? t('history.autoFinish') : t('history.manualFinish')}
        </Badge>
      </div>
      <Button className="self-start" onClick={() => setConfirmOpen(true)}>
        {t('queue.actions.replay')}
      </Button>
      <RematchConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        matchId={match.id}
        captainAName={match.captainA.name}
        captainBName={match.captainB.name}
      />
      <div className="text-[12.5px] text-muted">
        {match.fieldName} ·{' '}
        <bdi className="tabular" dir="ltr">
          {formatTimeOfDay(match.startedAt)}–{formatTimeOfDay(match.endedAt)}
        </bdi>
      </div>
      <div className="text-[12.5px] text-muted">
        {t('history.planned')} <bdi className="tabular" dir="ltr">{formatClock(match.plannedDurationSec)}</bdi>
        {' · '}
        {t('history.actual')}{' '}
        <bdi className={cn('tabular', delta && 'font-semibold text-warn')} dir="ltr">
          {formatClock(match.actualDurationSec)}
        </bdi>
      </div>
      {(match.startedByName || match.endedByName) && (
        <div className="text-[12.5px] text-muted">
          {match.startedByName && `${t('history.startedBy')} ${match.startedByName}`}
          {match.endedByName && ` · ${t('history.endedBy')} ${match.endedByName}`}
        </div>
      )}
    </div>
  )
}
