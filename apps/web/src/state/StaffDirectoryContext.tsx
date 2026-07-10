import { createContext, useContext } from 'react'
import type { CurrentStaff } from '@/state/AuthContext'

/**
 * Single responsibility: the staff roster + PIN-login used by the SwitchUser
 * overlay (client-prd §3.4, US-003) and SettingsScreen's StaffAdmin list.
 * Distinct from SessionActions (session mutations) — this is identity, not
 * queue state. Demo mode backs it with the mock roster; real mode is a
 * placeholder (empty roster, login rejects) until `/staff` + `/auth/login`
 * are wired through here too (later task — StaffLogin.tsx already calls them
 * directly for the initial sign-in flow).
 */
export type StaffRosterItem = CurrentStaff

export interface StaffDirectory {
  roster: StaffRosterItem[]
  /** Resolves with the switched-to staff on a correct PIN; rejects otherwise. */
  login(staffId: string, pin: string): Promise<StaffRosterItem>
}

export const StaffDirectoryContext = createContext<StaffDirectory | undefined>(undefined)

export function useStaffDirectory(): StaffDirectory {
  const value = useContext(StaffDirectoryContext)
  if (value === undefined) throw new Error('useStaffDirectory must be used within a StaffDirectoryContext.Provider')
  return value
}
