/**
 * Client-local stand-in for the line-manager snapshot contract. The queue is
 * a line of SINGLE teams (one team per row, never "A vs B") — two teams pair
 * into a MatchView only at kickoff (design.md §0, task brief "THE MODEL").
 *
 * `packages/shared` still carries the older A-vs-B queue contract at the
 * time this file was written (queue: MatchView[] with captainA/captainB +
 * queuePosition, no QueueEntryView/addToLine). This task is scoped to
 * apps/web only, so these shapes live here instead — CaptainView/
 * CaptainSearchResult/enums/SessionSummary are unaffected by the model
 * change and are still imported from 'shared'. Once the real line contract
 * lands in packages/shared, swap the source of these few types and this
 * file goes away; no call sites should need to change (field names match
 * the brief exactly: QueueEntryView { id, position, team }, MatchView keeps
 * captainA/captainB but drops queuePosition).
 */
import type { CaptainView, MatchStatus, SessionStatus } from 'shared'

/** One row in the line — a single team waiting its turn. */
export interface QueueEntryView {
  id: string
  position: number
  team: CaptainView
}

/** A live/finished pairing. No queuePosition — matches aren't queued, only lines are. */
export interface MatchView {
  id: string
  captainA: CaptainView
  captainB: CaptainView
  status: MatchStatus
  plannedDurationSec: number
  startedAt: string | null
  pausedAt: string | null
  accumulatedPauseSec: number
  endsAt: string | null
}

export interface FieldView {
  id: string
  name: string
  position: number
  liveMatch: MatchView | null
}

export interface SessionSnapshot {
  session: {
    id: string
    date: string
    location: string | null
    matchDurationSec: number
    status: SessionStatus
  }
  fields: FieldView[]
  queue: QueueEntryView[]
  emittedAt: string
  serverNow: string
}
