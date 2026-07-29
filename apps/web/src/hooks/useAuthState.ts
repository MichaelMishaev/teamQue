import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api'
import type { CurrentStaff } from '@/state/AuthContext'

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

/** Resolves the manager identity and starts the PIN flow on any failure. */
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
    onLoggedIn: (staff) => {
      setCurrentStaff(staff)
      setPhase('authed')
    },
  }
}
