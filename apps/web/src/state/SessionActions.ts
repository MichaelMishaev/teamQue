import { createContext, useContext } from 'react'
import type { CaptainSearchResult, OpenSessionBody } from 'shared'

/**
 * Single responsibility: the write side of the app's state abstraction —
 * every mutation a screen can trigger, as an intent (never a REST/socket
 * call directly). Implemented by `state/mock/mockSession.ts` in demo mode
 * and, later, by a real API-backed implementation — screens never change.
 *
 * Line model (task brief "THE MODEL"): the queue is a line of single teams;
 * two line entries pair into a match only at kickoff (startMatch). Deviations
 * from the brief's method list, both inherited from the prior A-vs-B build
 * for the same reasons:
 * 1. "all Promise<void>": `removeFromLine` and `finish` resolve with
 *    `{ activityId }` because the no-confirm-dialog rule (design.md §4)
 *    requires an undo toast wired to `undo(activityId)`, and there is no
 *    other channel to hand that id to the caller.
 * 2. `updateDuration` isn't in the brief's method list, but SettingsScreen's
 *    session duration stepper (US-012, "change duration mid-session")
 *    directly needs it — there is no other action that could carry it.
 */

export type CaptainRef = { id: string } | { newName: string }

export interface CaptainProfilePatch {
  nickname?: string
  tags?: string[]
  note?: string
}

export interface UndoableResult {
  activityId: string
}

export interface SessionActions {
  /** Appends one team to the back of the line. */
  addToLine(team: CaptainRef): Promise<void>
  searchTeams(q: string): Promise<CaptainSearchResult[]>
  /** Full reorder of the line, by entry id, optimistic on the caller's side. */
  reorderLine(entryIds: string[]): Promise<void>
  moveTop(entryId: string): Promise<void>
  moveBottom(entryId: string): Promise<void>
  removeFromLine(entryId: string): Promise<UndoableResult>
  /** Pairs the front two line entries into a live match, or the given pair. Field is implicit (MVP: single field). */
  startMatch(entryIds?: [string, string]): Promise<void>
  pause(matchId: string): Promise<void>
  resume(matchId: string): Promise<void>
  finish(matchId: string): Promise<UndoableResult>
  extend(matchId: string): Promise<void>
  /** Re-adds both of a finished match's teams to the back of the line. */
  replay(matchId: string): Promise<void>
  undo(activityId: string): Promise<void>
  openSession(cfg: OpenSessionBody): Promise<void>
  closeSession(): Promise<void>
  /** US-012 — applies to matches started afterwards; live matches unaffected. */
  updateDuration(matchDurationSec: number): Promise<void>
  updateTeam(id: string, patch: CaptainProfilePatch): Promise<void>
}

export const SessionActionsContext = createContext<SessionActions | undefined>(undefined)

export function useSessionActions(): SessionActions {
  const value = useContext(SessionActionsContext)
  if (value === undefined) throw new Error('useSessionActions must be used within a SessionActionsContext.Provider')
  return value
}
