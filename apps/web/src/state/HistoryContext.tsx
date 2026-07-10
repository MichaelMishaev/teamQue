import { createContext, useContext } from 'react'
import type { CaptainView, EndReason, SessionSummary } from 'shared'

/**
 * Single responsibility: read side for HistoryScreen — the finished-match
 * list and its aggregate SessionSummary (client-prd §3.3, US-070/073). Not
 * part of SessionSnapshot (which only carries the live queue/fields), so it
 * gets its own context; maps 1:1 to a future `GET /sessions/:id/summary` +
 * matches endpoint.
 */

export interface FinishedMatchView {
  id: string
  captainA: CaptainView
  captainB: CaptainView
  fieldName: string
  startedAt: string
  endedAt: string
  plannedDurationSec: number
  actualDurationSec: number
  endReason: EndReason
  startedByName: string | null
  endedByName: string | null
}

export interface HistoryState {
  summary: SessionSummary | null
  matches: FinishedMatchView[]
}

export const HistoryContext = createContext<HistoryState | undefined>(undefined)

export function useHistory(): HistoryState {
  const value = useContext(HistoryContext)
  if (value === undefined) throw new Error('useHistory must be used within a HistoryContext.Provider')
  return value
}
