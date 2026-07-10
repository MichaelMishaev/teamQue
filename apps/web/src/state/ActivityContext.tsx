import { createContext, useContext } from 'react'

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

export interface ActivityEntry {
  id: string
  atIso: string
  action: ActivityAction
  /** null = automatic/system action, not a staff member. */
  staffName: string | null
  captainA?: string
  captainB?: string
  fieldName?: string
}

export const ActivityContext = createContext<ActivityEntry[] | undefined>(undefined)

export function useActivityFeed(): ActivityEntry[] {
  const value = useContext(ActivityContext)
  if (value === undefined) throw new Error('useActivityFeed must be used within an ActivityContext.Provider')
  return value
}
