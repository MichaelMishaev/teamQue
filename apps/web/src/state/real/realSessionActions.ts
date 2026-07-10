/**
 * Real-mode implementation of SessionActions (technical-prd §7): every
 * method is exactly one REST call to apps/api. The server infers the acting
 * staff member from the session cookie (StaffSessionGuard) — unlike the mock,
 * nothing here needs an actor name.
 *
 * Session-scoped routes (line/start/close/updateDuration) need the active
 * session id, which screens never see directly (they only read the
 * snapshot) — SessionIdHandle is that seam. RealProviders keeps it synced to
 * the live snapshot's session id; openSession/closeSession additionally push
 * their own REST response through it so a call made before the next socket
 * push still targets the right session (the snapshot schema also has no way
 * to represent "no session", so closeSession clears it directly rather than
 * waiting on a socket push that will never come).
 */
import type {
  CaptainSearchResult,
  FinishMatchResult,
  MatchView,
  OpenSessionBody,
  QueueEntryView,
  RemoveFromLineResult,
  ReorderLineResult,
} from 'shared'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
import type { CaptainProfilePatch, CaptainRef, SessionActions, UndoableResult } from '@/state/SessionActions'

/** Matches mockSession's extend() — the UI has no duration input for it (task brief). */
const EXTEND_ADD_SEC = 60

export interface SessionIdHandle {
  get(): string | null
  set(id: string | null): void
}

function requireSessionId(handle: SessionIdHandle): string {
  const id = handle.get()
  if (!id) throw new Error('no active session')
  return id
}

/** Web's CaptainRef is `{id}|{newName}`; the wire contract (shared's captainRefSchema) is a bare id string or `{newName}`. */
function toWireTeamRef(ref: CaptainRef): string | { newName: string } {
  return 'id' in ref ? ref.id : ref
}

export function createRealSessionActions(sessionIdHandle: SessionIdHandle): SessionActions {
  return {
    async addToLine(team) {
      const sessionId = requireSessionId(sessionIdHandle)
      await apiPost<QueueEntryView>(`/sessions/${sessionId}/line`, { team: toWireTeamRef(team) })
    },

    async searchTeams(q) {
      const query = q.trim()
      if (!query) return []
      return apiGet<CaptainSearchResult[]>(`/captains?q=${encodeURIComponent(query)}`)
    },

    async reorderLine(entryIds) {
      const sessionId = requireSessionId(sessionIdHandle)
      await apiPatch<ReorderLineResult>(`/sessions/${sessionId}/line`, { entryIds })
    },

    async moveTop(entryId) {
      await apiPost<QueueEntryView>(`/line/${entryId}/move-top`)
    },

    async moveBottom(entryId) {
      await apiPost<QueueEntryView>(`/line/${entryId}/move-bottom`)
    },

    async removeFromLine(entryId): Promise<UndoableResult> {
      const result = await apiDelete<RemoveFromLineResult>(`/line/${entryId}`)
      return { activityId: result.activityId }
    },

    async startMatch(entryIds) {
      const sessionId = requireSessionId(sessionIdHandle)
      await apiPost<MatchView>(`/sessions/${sessionId}/start`, entryIds ? { entryIds } : {})
    },

    async pause(matchId) {
      await apiPost<MatchView>(`/matches/${matchId}/pause`)
    },

    async resume(matchId) {
      await apiPost<MatchView>(`/matches/${matchId}/resume`)
    },

    async finish(matchId): Promise<UndoableResult> {
      const result = await apiPost<FinishMatchResult>(`/matches/${matchId}/finish`)
      return { activityId: result.activityId }
    },

    async extend(matchId) {
      await apiPost<MatchView>(`/matches/${matchId}/extend`, { addSec: EXTEND_ADD_SEC })
    },

    async replay(matchId) {
      await apiPost<QueueEntryView[]>(`/matches/${matchId}/replay`)
    },

    async undo(activityId) {
      await apiPost(`/actions/${activityId}/undo`)
    },

    async openSession(cfg: OpenSessionBody) {
      const session = await apiPost<{ id: string }>('/sessions', cfg)
      sessionIdHandle.set(session.id)
    },

    async closeSession() {
      const sessionId = requireSessionId(sessionIdHandle)
      await apiPost(`/sessions/${sessionId}/close`)
      sessionIdHandle.set(null)
    },

    async updateDuration(matchDurationSec) {
      const sessionId = requireSessionId(sessionIdHandle)
      await apiPatch(`/sessions/${sessionId}`, { matchDurationSec })
    },

    async updateTeam(id, patch: CaptainProfilePatch) {
      await apiPatch<CaptainSearchResult>(`/captains/${id}`, patch)
    },
  }
}
