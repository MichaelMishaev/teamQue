import { createContext, useContext, useMemo } from 'react'
import type { ActivityActorFacet, ActivityActionFacet, ActivityEventKind, ActivityOutcome, ErrorCode } from 'shared'

/**
 * Single responsibility: read side for the ActivityFeed tab — a chronological
 * staff action log (client-prd §3.3, US-072). `staffName: null` marks an
 * automatic/system action (auto-finish), rendered muted/italic vs bold.
 */

export type ActivityAction =
  | 'session.open'
  | 'session.close'
  | 'session.updateDuration'
  | 'line.addToLine'
  | 'line.reorder'
  | 'line.remove'
  | 'match.start'
  | 'match.pause'
  | 'match.resume'
  | 'match.extend'
  | 'match.finish.manual'
  | 'match.finish.auto'
  | 'match.replay'
  | 'match.undo'
  | 'team.update'
  | 'field.open'
  | 'field.close'
  | 'field.expire'
  | 'publicLine.viewed'
  | 'publicLine.visitEnded'
  | 'exception'
  | 'unknown'

export interface ActivityEntry {
  id: string
  atIso: string
  action: ActivityAction
  rawAction?: string
  eventKind?: ActivityEventKind
  outcome?: ActivityOutcome
  staffId?: string | null
  /** null = automatic/system action, not a staff member. */
  staffName: string | null
  captainA?: string
  captainB?: string
  fieldName?: string
  errorCode?: ErrorCode
  statusCode?: number
  correlationId?: string
  requestMethod?: string
  requestPath?: string
}

export interface ActivityLogFilters {
  eventKind: 'all' | ActivityEventKind
  outcome: 'all' | ActivityOutcome
  action: string
  staffId: string
  statusCode: string
  from: string
  to: string
}

export interface ActivityLogPage {
  entries: ActivityEntry[]
  nextCursor: string | null
  actions: ActivityActionFacet[]
  actors: ActivityActorFacet[]
}

export interface ActivityLogSource {
  entries: ActivityEntry[]
  revision: string | null
  loadPage: (filters: ActivityLogFilters, cursor?: string) => Promise<ActivityLogPage>
  local?: boolean
}

export const ActivityContext = createContext<ActivityEntry[] | ActivityLogSource | undefined>(undefined)

export function useActivityFeed(): ActivityLogSource {
  const value = useContext(ActivityContext)
  const normalized = useMemo(() => {
    if (value === undefined || !Array.isArray(value)) return value
    return {
      entries: value,
      revision: null,
      local: true,
      async loadPage(filters: ActivityLogFilters): Promise<ActivityLogPage> {
        const entries = filterLocalActivity(value, filters)
        return {
          entries,
          nextCursor: null,
          actions: actionFacets(value),
          actors: actorFacets(value),
        }
      },
    }
  }, [value])
  if (normalized === undefined) throw new Error('useActivityFeed must be used within an ActivityContext.Provider')
  return normalized
}

function filterLocalActivity(entries: ActivityEntry[], filters: ActivityLogFilters): ActivityEntry[] {
  const from = filters.from ? new Date(filters.from).getTime() : null
  const to = filters.to ? new Date(filters.to).getTime() : null
  return entries.filter((entry) => {
    const at = new Date(entry.atIso).getTime()
    return (
      (filters.eventKind === 'all' || (entry.eventKind ?? 'action') === filters.eventKind) &&
      (filters.outcome === 'all' || (entry.outcome ?? 'success') === filters.outcome) &&
      (!filters.action || (entry.rawAction ?? entry.action) === filters.action) &&
      (!filters.staffId || entry.staffId === filters.staffId) &&
      (!filters.statusCode || String(entry.statusCode ?? '') === filters.statusCode) &&
      (from === null || at >= from) &&
      (to === null || at <= to)
    )
  })
}

function actionFacets(entries: ActivityEntry[]): ActivityActionFacet[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const action = entry.rawAction ?? entry.action
    counts.set(action, (counts.get(action) ?? 0) + 1)
  }
  return [...counts].map(([action, count]) => ({ action, count }))
}

function actorFacets(entries: ActivityEntry[]): ActivityActorFacet[] {
  const counts = new Map<string, ActivityActorFacet>()
  for (const entry of entries) {
    if (!entry.staffId || !entry.staffName) continue
    const current = counts.get(entry.staffId) ?? { staffId: entry.staffId, staffName: entry.staffName, count: 0 }
    current.count += 1
    counts.set(entry.staffId, current)
  }
  return [...counts.values()]
}
