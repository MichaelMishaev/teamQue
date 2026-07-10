import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api'

/**
 * Auth phases driving AppGate (client-prd §3.4): GET /auth/me on mount picks
 * the starting phase. Per spec, ANY failure (not just 401) restarts the flow
 * at CenterUnlock — MVP intentionally doesn't distinguish "no center cookie"
 * from "expired staff session" (see AppGate.tsx TODO/concern).
 */
export type AuthPhase = 'loading' | 'needs-center' | 'needs-login' | 'authed'

export interface UseAuthStateResult {
  phase: AuthPhase
  onCenterUnlocked: () => void
  onLoggedIn: () => void
}

export function useAuthState(): UseAuthStateResult {
  const [phase, setPhase] = useState<AuthPhase>('loading')

  useEffect(() => {
    let cancelled = false
    apiGet('/auth/me')
      .then(() => {
        if (!cancelled) setPhase('authed')
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
    onCenterUnlocked: () => setPhase('needs-login'),
    onLoggedIn: () => setPhase('authed'),
  }
}
