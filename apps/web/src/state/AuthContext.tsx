import { createContext, useContext, type ReactNode } from 'react'
import type { StaffRole } from 'shared'

/**
 * Single responsibility: exposes the signed-in staff member's identity/role
 * to screens gated on it (SettingsScreen = manager-only, SwitchUser, staff
 * attribution). Mounted by AppGate once `phase === 'authed'` — the role
 * itself comes from whoever drives AppGate (mock in demo mode; the
 * GET /auth/me response in real mode).
 */

export interface CurrentStaff {
  id: string
  name: string
  role: StaffRole
}

const AuthContext = createContext<CurrentStaff | null | undefined>(undefined)

export function AuthProvider({ currentStaff, children }: { currentStaff: CurrentStaff | null; children: ReactNode }) {
  return <AuthContext.Provider value={currentStaff}>{children}</AuthContext.Provider>
}

/** Non-null once AppGate resolves GET /auth/me; null only in the error state. */
export function useCurrentStaff(): CurrentStaff | null {
  const value = useContext(AuthContext)
  if (value === undefined) throw new Error('useCurrentStaff must be used within AuthProvider')
  return value
}
