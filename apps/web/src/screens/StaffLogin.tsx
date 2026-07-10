import { useEffect, useState } from 'react'
import { PinPad } from '@/components/PinPad'
import { t } from '@/i18n'
import { apiGet, apiPost, ApiRequestError } from '@/lib/api'
import type { CurrentStaff } from '@/state/AuthContext'

/**
 * Single responsibility: staff picker (name-chip grid, ≥48px targets) → PIN
 * login (client-prd §3.4). A PIN_LOCKED response feeds PinPad's own lockout
 * countdown from the server's retryAfterSec. `onSuccess` receives the staff
 * POST /auth/login just authenticated as — the identity AppGate needs to
 * seed AuthContext with, since /auth/login's response is the only place it's
 * available before the next /auth/me round trip.
 */

const PIN_LENGTH = 4

export interface StaffListItem {
  id: string
  name: string
}

interface LoginResponse {
  staffId: string
  name: string
  role: CurrentStaff['role']
}

export interface StaffLoginProps {
  onSuccess: (staff: CurrentStaff) => void
}

function retryAfterSecFrom(details: unknown): number | undefined {
  if (typeof details !== 'object' || details === null || !('retryAfterSec' in details)) return undefined
  const value = (details as { retryAfterSec: unknown }).retryAfterSec
  return typeof value === 'number' ? value : undefined
}

export function StaffLogin({ onSuccess }: StaffLoginProps) {
  const [staff, setStaff] = useState<StaffListItem[] | null>(null)
  const [selected, setSelected] = useState<StaffListItem | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lockedForSec, setLockedForSec] = useState<number | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiGet<StaffListItem[]>('/staff').then((list) => {
      if (!cancelled) setStaff(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function pickStaff(item: StaffListItem) {
    setSelected(item)
    setPin('')
    setError(null)
    setLockedForSec(undefined)
  }

  async function submit(candidate: string) {
    if (!selected) return
    setSubmitting(true)
    try {
      const result = await apiPost<LoginResponse>('/auth/login', { staffId: selected.id, pin: candidate })
      onSuccess({ id: result.staffId, name: result.name, role: result.role })
    } catch (err) {
      setPin('')
      if (err instanceof ApiRequestError && err.code === 'PIN_LOCKED') {
        setLockedForSec(retryAfterSecFrom(err.details) ?? 0)
      } else {
        setError(t('auth.login.wrongPin'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleDigit(digit: number) {
    if (submitting || pin.length >= PIN_LENGTH) return
    setError(null)
    const next = pin + String(digit)
    setPin(next)
    if (next.length === PIN_LENGTH) void submit(next)
  }

  function handleDelete() {
    setError(null)
    setPin((current) => current.slice(0, -1))
  }

  if (!selected) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <h1 className="text-lg font-bold">{t('auth.login.title')}</h1>
        <div className="grid grid-cols-3 gap-3">
          {(staff ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => pickStaff(item)}
              className="min-h-12 rounded-xl border border-line bg-surface px-3 text-[15px] font-semibold"
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <h1 className="text-lg font-bold">{selected.name}</h1>
      <PinPad
        filled={pin.length}
        onDigit={handleDigit}
        onDelete={handleDelete}
        {...(lockedForSec !== undefined ? { lockedForSec } : {})}
      />
      {error && (
        <p role="alert" className="text-[13.5px] font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
