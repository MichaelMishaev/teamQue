import { useState } from 'react'
import { PinPad } from '@/components/PinPad'
import { t } from '@/i18n'
import { apiPost } from '@/lib/api'

/**
 * Single responsibility: device-level center PIN unlock, entered once per
 * device (client-prd §3.4). A wrong PIN clears the dots and shows an inline error.
 */

const PIN_LENGTH = 4

export interface CenterUnlockProps {
  onSuccess: () => void
}

export function CenterUnlock({ onSuccess }: CenterUnlockProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(candidate: string) {
    setSubmitting(true)
    try {
      await apiPost('/auth/center', { pin: candidate })
      onSuccess()
    } catch {
      setPin('')
      setError(t('auth.center.wrongPin'))
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

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <h1 className="text-lg font-bold">{t('auth.center.title')}</h1>
      <PinPad filled={pin.length} onDigit={handleDigit} onDelete={handleDelete} />
      {error && (
        <p role="alert" className="text-[13.5px] font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
