import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { t, type MessageKey } from '@/i18n'
import { cn } from '@/lib/cn'
import { formatTimeOfDay } from '@/lib/time'
import {
  useActivityFeed,
  type ActivityAction,
  type ActivityEntry,
  type ActivityLogFilters,
} from '@/state/ActivityContext'

/**
 * Single responsibility: complete, filterable operational history. Successful
 * mutations and safe exception records share one chronological feed; cursor
 * pagination keeps old history available without loading it all at once.
 */
const MESSAGE_KEY: Record<ActivityAction, MessageKey> = {
  'session.open': 'activity.sessionOpen',
  'session.close': 'activity.sessionClose',
  'session.updateDuration': 'activity.updateDuration',
  'line.addToLine': 'activity.addToLine',
  'line.reorder': 'activity.reorder',
  'line.remove': 'activity.remove',
  'match.start': 'activity.start',
  'match.pause': 'activity.pause',
  'match.resume': 'activity.resume',
  'match.extend': 'activity.extend',
  'match.finish.manual': 'activity.finishManual',
  'match.finish.auto': 'activity.finishAuto',
  'match.replay': 'activity.replay',
  'match.undo': 'activity.undo',
  'team.update': 'activity.teamUpdate',
  'field.open': 'activity.fieldOpen',
  'field.close': 'activity.fieldClose',
  'field.expire': 'activity.fieldExpire',
  'publicLine.viewed': 'activity.publicLineViewed',
  'publicLine.visitEnded': 'activity.publicLineVisitEnded',
  exception: 'activity.unknown',
  unknown: 'activity.unknown',
}

const INITIAL_FILTERS: ActivityLogFilters = {
  eventKind: 'all',
  outcome: 'all',
  action: '',
  staffId: '',
  statusCode: '',
  from: '',
  to: '',
}

const STATUS_CODES = ['400', '401', '403', '404', '409', '423', '429', '500'] as const

function activityMessage(entry: ActivityEntry): string {
  const base = t(MESSAGE_KEY[entry.action])
  if (!entry.captainA) return base
  const pair = entry.captainB ? `${entry.captainA} נגד ${entry.captainB}` : entry.captainA
  const field = entry.fieldName ? ` (${entry.fieldName})` : ''
  return `${base}: ${pair}${field}`
}

export function ActivityFeed() {
  const source = useActivityFeed()
  const [filters, setFilters] = useState<ActivityLogFilters>(INITIAL_FILTERS)
  const [remoteEntries, setRemoteEntries] = useState<ActivityEntry[]>(source.entries)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [actions, setActions] = useState<Array<{ action: string; count: number }>>([])
  const [actors, setActors] = useState<Array<{ staffId: string; staffName: string; count: number }>>([])
  const [loading, setLoading] = useState(source.local !== true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    if (source.local) return
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    setRemoteEntries([])

    void source
      .loadPage(filters, undefined)
      .then((page) => {
        if (cancelled) return
        setRemoteEntries(page.entries)
        setNextCursor(page.nextCursor)
        setActions(page.actions)
        setActors(page.actors)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [filters, retryNonce, source.loadPage, source.revision])

  const localEntries = useMemo(
    () => (source.local ? filterLocalEntries(source.entries, filters) : remoteEntries),
    [filters, remoteEntries, source.entries, source.local],
  )
  const localActions = useMemo(
    () => (source.local ? buildActionFacets(source.entries) : actions),
    [actions, source.entries, source.local],
  )
  const localActors = useMemo(
    () => (source.local ? buildActorFacets(source.entries) : actors),
    [actors, source.entries, source.local],
  )

  async function loadMore(): Promise<void> {
    if (source.local || !nextCursor || loadingMore) return
    setLoadingMore(true)
    setLoadError(false)
    try {
      const page = await source.loadPage(filters, nextCursor)
      setRemoteEntries((current) => [...current, ...page.entries])
      setNextCursor(page.nextCursor)
    } catch {
      setLoadError(true)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <h1 className="text-[20px] font-bold text-ink">{t('activity.title')}</h1>
        <p className="mt-1 text-[13px] text-muted">{t('activity.subtitle')}</p>
      </header>

      <section className="flex flex-col gap-3" aria-label={t('activity.filters.type')}>
        <div className="grid grid-cols-3 rounded-xl bg-surface-2 p-1">
          <KindButton active={filters.eventKind === 'all'} onClick={() => setFilters((current) => ({ ...current, eventKind: 'all' }))}>
            {t('activity.filters.all')}
          </KindButton>
          <KindButton active={filters.eventKind === 'action'} onClick={() => setFilters((current) => ({ ...current, eventKind: 'action' }))}>
            {t('activity.filters.actions')}
          </KindButton>
          <KindButton active={filters.eventKind === 'exception'} onClick={() => setFilters((current) => ({ ...current, eventKind: 'exception' }))}>
            {t('activity.filters.exceptions')}
          </KindButton>
        </div>

        <details
          className="rounded-xl border border-line bg-surface"
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        >
          <summary className="min-h-[var(--touch-target-min)] cursor-pointer px-3 py-3 text-[14px] font-semibold text-ink">
            {t('activity.filters.more')}
          </summary>
          <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2">
            <FilterField label={t('activity.filters.action')}>
              <select
                aria-label={t('activity.filters.action')}
                value={filters.action}
                onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}
                className="min-h-[var(--touch-target-min)] w-full rounded-lg border border-line bg-surface-2 px-2 text-[14px] text-ink"
              >
                <option value="">{t('activity.filters.anyAction')}</option>
                {advancedOpen && localActions.map((facet) => (
                  <option key={facet.action} value={facet.action}>
                    {actionFacetLabel(facet.action)} ({facet.count})
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label={t('activity.filters.actor')}>
              <select
                aria-label={t('activity.filters.actor')}
                value={filters.staffId}
                onChange={(event) => setFilters((current) => ({ ...current, staffId: event.target.value }))}
                className="min-h-[var(--touch-target-min)] w-full rounded-lg border border-line bg-surface-2 px-2 text-[14px] text-ink"
              >
                <option value="">{t('activity.filters.anyActor')}</option>
                {advancedOpen && localActors.map((facet) => (
                  <option key={facet.staffId} value={facet.staffId}>
                    {facet.staffName} ({facet.count})
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label={t('activity.filters.outcome')}>
              <select
                aria-label={t('activity.filters.outcome')}
                value={filters.outcome}
                onChange={(event) => setFilters((current) => ({ ...current, outcome: event.target.value as ActivityLogFilters['outcome'] }))}
                className="min-h-[var(--touch-target-min)] w-full rounded-lg border border-line bg-surface-2 px-2 text-[14px] text-ink"
              >
                <option value="all">{t('activity.filters.anyOutcome')}</option>
                <option value="success">{t('activity.filters.success')}</option>
                <option value="rejected">{t('activity.filters.rejected')}</option>
                <option value="failed">{t('activity.filters.failed')}</option>
              </select>
            </FilterField>

            <FilterField label={t('activity.filters.status')}>
              <select
                aria-label={t('activity.filters.status')}
                value={filters.statusCode}
                onChange={(event) => setFilters((current) => ({ ...current, statusCode: event.target.value }))}
                className="min-h-[var(--touch-target-min)] w-full rounded-lg border border-line bg-surface-2 px-2 text-[14px] text-ink"
                dir="ltr"
              >
                <option value="">{t('activity.filters.anyStatus')}</option>
                {STATUS_CODES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </FilterField>

            <FilterField label={t('activity.filters.from')}>
              <input
                type="datetime-local"
                aria-label={t('activity.filters.from')}
                value={filters.from}
                onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
                className="min-h-[var(--touch-target-min)] w-full rounded-lg border border-line bg-surface-2 px-2 text-[14px] text-ink"
                dir="ltr"
              />
            </FilterField>

            <FilterField label={t('activity.filters.to')}>
              <input
                type="datetime-local"
                aria-label={t('activity.filters.to')}
                value={filters.to}
                onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
                className="min-h-[var(--touch-target-min)] w-full rounded-lg border border-line bg-surface-2 px-2 text-[14px] text-ink"
                dir="ltr"
              />
            </FilterField>

            <Button className="sm:col-span-2" onClick={() => setFilters(INITIAL_FILTERS)}>
              {t('activity.filters.reset')}
            </Button>
          </div>
        </details>
      </section>

      <p className="text-[12px] text-muted" aria-live="polite">
        {t('activity.loadedCount', { count: localEntries.length })}
      </p>

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-danger/50 bg-surface px-3 py-2 text-[13px] text-danger" role="alert">
          <span>{t('activity.loadError')}</span>
          <button type="button" className="min-h-[var(--touch-target-min)] font-semibold" onClick={() => setRetryNonce((value) => value + 1)}>
            {t('activity.retry')}
          </button>
        </div>
      )}

      {loading && localEntries.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-muted">{t('activity.loading')}</p>
      ) : localEntries.length === 0 ? (
        <EmptyState title={hasActiveFilters(filters) ? t('activity.filteredEmpty') : t('activity.empty')} />
      ) : (
        <div className="rounded-xl border border-line bg-surface px-3">
          {localEntries.map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {nextCursor && !source.local && (
        <Button onClick={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? t('activity.loading') : t('activity.loadMore')}
        </Button>
      )}
    </div>
  )
}

function KindButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-[var(--touch-target-min)] rounded-lg px-2 text-[13px] font-semibold',
        active ? 'bg-accent-dim text-accent' : 'text-muted',
      )}
    >
      {children}
    </button>
  )
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-muted">
      <span>{label}</span>
      {children}
    </label>
  )
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const isException = (entry.eventKind ?? 'action') === 'exception'
  const isAuto = entry.staffName === null
  const date = new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(entry.atIso))

  return (
    <div className={cn('flex items-start gap-3 border-b border-line py-3 text-[14px] last:border-b-0', isException && 'border-s-2 border-s-danger ps-3')}>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] text-muted">
        <bdi dir="ltr" className="tabular">{formatTimeOfDay(entry.atIso)}</bdi>
        <bdi dir="ltr" className="tabular">{date}</bdi>
      </div>
      {isException ? (
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-danger">
            {entry.outcome === 'failed' ? t('activity.exception.failed') : t('activity.exception.rejected')}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
            {entry.staffName && <span className="font-semibold text-ink">{entry.staffName}</span>}
            {entry.statusCode !== undefined && <bdi dir="ltr" className="tabular">{entry.statusCode}</bdi>}
            {entry.errorCode && <bdi dir="ltr" className="font-mono text-warn">{entry.errorCode}</bdi>}
          </div>
          {entry.requestPath && (
            <bdi dir="ltr" className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-muted">
              {entry.requestMethod} {entry.requestPath}
            </bdi>
          )}
          {entry.correlationId && (
            <p className="mt-1 text-[11px] text-muted">
              {t('activity.exception.correlation')}: <bdi dir="ltr" className="font-mono">{entry.correlationId.slice(0, 8)}</bdi>
            </p>
          )}
        </div>
      ) : (
        <p className={cn('min-w-0', isAuto ? 'italic text-muted' : 'text-ink')}>
          {!isAuto && <b className="font-bold">{entry.staffName} </b>}
          {activityMessage(entry)}
        </p>
      )}
    </div>
  )
}

function filterLocalEntries(entries: ActivityEntry[], filters: ActivityLogFilters): ActivityEntry[] {
  const from = filters.from ? new Date(filters.from).getTime() : null
  const to = filters.to ? new Date(filters.to).getTime() : null
  return entries.filter((entry) => {
    const kind = entry.eventKind ?? 'action'
    const outcome = entry.outcome ?? 'success'
    const at = new Date(entry.atIso).getTime()
    return (
      (filters.eventKind === 'all' || kind === filters.eventKind) &&
      (filters.outcome === 'all' || outcome === filters.outcome) &&
      (!filters.action || (entry.rawAction ?? entry.action) === filters.action) &&
      (!filters.staffId || entry.staffId === filters.staffId) &&
      (!filters.statusCode || String(entry.statusCode ?? '') === filters.statusCode) &&
      (from === null || at >= from) &&
      (to === null || at <= to)
    )
  })
}

function buildActionFacets(entries: ActivityEntry[]): Array<{ action: string; count: number }> {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const action = entry.rawAction ?? entry.action
    counts.set(action, (counts.get(action) ?? 0) + 1)
  }
  return [...counts].map(([action, count]) => ({ action, count }))
}

function buildActorFacets(entries: ActivityEntry[]): Array<{ staffId: string; staffName: string; count: number }> {
  const actors = new Map<string, { staffId: string; staffName: string; count: number }>()
  for (const entry of entries) {
    if (!entry.staffId || !entry.staffName) continue
    const current = actors.get(entry.staffId) ?? { staffId: entry.staffId, staffName: entry.staffName, count: 0 }
    current.count += 1
    actors.set(entry.staffId, current)
  }
  return [...actors.values()]
}

function actionFacetLabel(rawAction: string): string {
  const mapped = RAW_ACTION_LABEL[rawAction] ?? (rawAction in MESSAGE_KEY ? (rawAction as ActivityAction) : undefined)
  return mapped ? t(MESSAGE_KEY[mapped]) : rawAction
}

const RAW_ACTION_LABEL: Record<string, ActivityAction> = {
  'session.opened': 'session.open',
  'session.closed': 'session.close',
  'session.updated': 'session.updateDuration',
  'line.added': 'line.addToLine',
  'line.reordered': 'line.reorder',
  'line.removed': 'line.remove',
  'line.moved': 'line.reorder',
  'line.cleared': 'session.close',
  'match.started': 'match.start',
  'match.paused': 'match.pause',
  'match.resumed': 'match.resume',
  'match.extended': 'match.extend',
  'match.replayed': 'match.replay',
  'match.cancelled': 'line.remove',
  'captain.created': 'team.update',
  'captain.updated': 'team.update',
  'field.created': 'field.open',
  'field.closed': 'field.close',
  'field.expired': 'field.expire',
  'public_line.viewed': 'publicLine.viewed',
  'public_line.visit_ended': 'publicLine.visitEnded',
  undo: 'match.undo',
}

function hasActiveFilters(filters: ActivityLogFilters): boolean {
  return Object.entries(filters).some(([key, value]) => (key === 'eventKind' || key === 'outcome' ? value !== 'all' : value !== ''))
}
