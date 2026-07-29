import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '@/lib/api'
import type { CurrentStaff } from '@/state/AuthContext'

export type AuthPhase = 'loading' | 'needs-center' | 'authed'

interface AuthMeResponse {
  staff: CurrentStaff
  center: { id: string; name: string }
}

interface TrustedDeviceResponse {
  staffId: string
  role: CurrentStaff['role']
}

export interface UseAuthStateResult {
  phase: AuthPhase
  currentStaff: CurrentStaff | null
  onCenterUnlocked: () => Promise<void>
}

function anonymousManager(staffId: string, role: CurrentStaff['role']): CurrentStaff {
  return { id: staffId, name: '', role }
}

/** Restores a trusted manager device without exposing a personal identity. */
export function useAuthState(): UseAuthStateResult {
  const [phase, setPhase] = useState<AuthPhase>('loading')
  const [currentStaff, setCurrentStaff] = useState<CurrentStaff | null>(null)

  useEffect(() => {
    let cancelled = false

    async function restore(): Promise<void> {
      try {
        const me = await apiGet<AuthMeResponse>('/auth/me')
        if (cancelled) return
        setCurrentStaff(anonymousManager(me.staff.id, me.staff.role))
        setPhase('authed')
      } catch {
        try {
          const device = await apiPost<TrustedDeviceResponse>('/auth/device')
          if (cancelled) return
          setCurrentStaff(anonymousManager(device.staffId, device.role))
          setPhase('authed')
        } catch {
          if (!cancelled) setPhase('needs-center')
        }
      }
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  return {
    phase,
    currentStaff,
    onCenterUnlocked: async () => {
      const device = await apiPost<TrustedDeviceResponse>('/auth/device')
      setCurrentStaff(anonymousManager(device.staffId, device.role))
      setPhase('authed')
    },
  }
}
