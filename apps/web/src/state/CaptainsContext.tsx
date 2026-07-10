import { createContext, useContext } from 'react'

/**
 * Single responsibility: read side for CaptainSheet — nickname/tags/private
 * note/totals (US-023, F11). CaptainView (shared) only carries the
 * per-match fairness stats (gamesToday/lastPlayedAt); the sheet's extra
 * fields aren't part of the snapshot contract, so they get their own store.
 */

export interface CaptainProfile {
  id: string
  name: string
  nickname: string | null
  tags: string[]
  note: string
  gamesToday: number
  lastPlayedAt: string | null
  totalMatches: number
}

export const CaptainsContext = createContext<CaptainProfile[] | undefined>(undefined)

export function useCaptainProfiles(): CaptainProfile[] {
  const value = useContext(CaptainsContext)
  if (value === undefined) throw new Error('useCaptainProfiles must be used within a CaptainsContext.Provider')
  return value
}
