import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api'
import type { CurrentStaff } from '@/state/AuthContext'

/**
 * Resolves the current identity for AppGate. GET /auth/me now always returns a
 * real identity — the API falls back to the seeded center + its manager when no
 * cookies are present (auth is open, no PIN gate), or to a real staff member if
 * a session cookie exists from SwitchUser. `error` covers only the pathological
 * cases where /auth/me itself can't resolve (network failure, empty database).
 */
export type AuthPhase = 'loading' | 'authed' | 'error'

interface AuthMeResponse {
  staff: CurrentStaff
  center: { id: string; name: string }
}

export interface UseAuthStateResult {
  phase: AuthPhase
  currentStaff: CurrentStaff | null
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
        if (!cancelled) setPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { phase, currentStaff }
}
