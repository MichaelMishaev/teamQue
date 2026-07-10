import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api'
import type { CurrentStaff } from '@/state/AuthContext'

/**
 * Auth phases driving AppGate (client-prd §3.4): GET /auth/me on mount picks
 * the starting phase and, on success, seeds `currentStaff` from its
 * `staff` field. Per spec, ANY failure (not just 401) restarts the flow
 * at CenterUnlock — MVP intentionally doesn't distinguish "no center cookie"
 * from "expired staff session" (see AppGate.tsx TODO/concern).
 *
 * `onLoggedIn` takes the staff StaffLogin just authenticated as — the only
 * other place `currentStaff` can come from — so AppGate always has an
 * identity by the time it renders `children`.
 */
export type AuthPhase = 'loading' | 'needs-center' | 'needs-login' | 'authed'

interface AuthMeResponse {
  staff: CurrentStaff
  center: { id: string; name: string }
}

export interface UseAuthStateResult {
  phase: AuthPhase
  currentStaff: CurrentStaff | null
  onCenterUnlocked: () => void
  onLoggedIn: (staff: CurrentStaff) => void
}

export function useAuthState(): UseAuthStateResult {
  const [phase, setPhase] = useState<AuthPhase>('loading')
  const [currentStaff, setCurrentStaff] = useState<CurrentStaff | null>(null)

  useEffect(() => {
    let cancelled = false
    apiGet<AuthMeResponse>('/auth/me')
      .then((me) => {
        if (cancelled) return
        setCurrentStaff(me.staff)
        setPhase('authed')
      })
      .catch(() => {
        if (!cancelled) setPhase('needs-center')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return {
    phase,
    currentStaff,
    onCenterUnlocked: () => setPhase('needs-login'),
    onLoggedIn: (staff: CurrentStaff) => {
      setCurrentStaff(staff)
      setPhase('authed')
    },
  }
}
