/**
 * Adapters mapping the API read-endpoint shapes (shared reads.ts) onto the
 * web read contexts (History/Activity/Captains). The server's activity action
 * names (past-tense: 'line.added', 'match.started') differ from the web's
 * ActivityAction union — mapped here so the ActivityFeed's i18n keys resolve.
 */
import type { ActivityEntry as WireActivityEntry, CaptainSearchResult, HistoryEntry } from 'shared'
import type { ActivityAction, ActivityEntry } from '@/state/ActivityContext'
import type { CaptainProfile } from '@/state/CaptainsContext'
import type { FinishedMatchView } from '@/state/HistoryContext'

export function toFinishedMatchView(h: HistoryEntry): FinishedMatchView {
  // HistoryEntry carries flat captain names; FinishedMatchView wants CaptainView
  // objects — the extra fairness stats (gamesToday/lastPlayedAt) aren't relevant
  // to a finished match, so fill neutral defaults.
  return {
    id: h.id,
    captainA: { id: h.captainAId, name: h.captainAName, nickname: null, gamesToday: 0, lastPlayedAt: null },
    captainB: { id: h.captainBId, name: h.captainBName, nickname: null, gamesToday: 0, lastPlayedAt: null },
    fieldName: h.fieldName ?? '',
    startedAt: h.startedAt,
    endedAt: h.endedAt,
    plannedDurationSec: h.plannedDurationSec,
    actualDurationSec: h.actualDurationSec,
    endReason: h.endReason,
    startedByName: h.startedByName,
    endedByName: h.endedByName,
  }
}

/** Server action name → web ActivityAction. Every action the API writes is covered. */
const ACTION_MAP: Record<string, ActivityAction> = {
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
  undo: 'match.undo',
}

/**
 * The API's activity endpoint returns the raw activity_log row (staffId +
 * createdAt, no names). Resolve the staff name from the roster; a null staffId
 * marks an automatic/system action (e.g. auto-finish). Team/field names aren't
 * carried on the row, so activity lines render action + staff + time.
 */
export function toActivityEntry(a: WireActivityEntry, resolveStaffName: (staffId: string) => string | null): ActivityEntry {
  const staffName = a.staffId === null ? null : resolveStaffName(a.staffId)
  // 'match.finished' covers both manual and automatic finishes; a null staff
  // (auto-finish scheduler, US-044) distinguishes the automatic one.
  const action: ActivityAction =
    a.action === 'match.finished'
      ? a.staffId === null
        ? 'match.finish.auto'
        : 'match.finish.manual'
      : (ACTION_MAP[a.action] ?? 'team.update')

  return { id: a.id, atIso: a.createdAt, action, staffName }
}

export function toCaptainProfile(c: CaptainSearchResult): CaptainProfile {
  return {
    id: c.id,
    name: c.name,
    nickname: c.nickname,
    tags: c.tags,
    note: c.note ?? '',
    gamesToday: c.gamesToday,
    lastPlayedAt: c.lastPlayedAt,
    totalMatches: c.totalMatches,
  }
}
