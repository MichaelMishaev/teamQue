import { useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { PinPad } from '@/components/PinPad'
import { StaffPicker, type StaffPickerItem } from '@/components/StaffPicker'
import { t } from '@/i18n'
import { useStaffDirectory, type StaffRosterItem } from '@/state/StaffDirectoryContext'

const PIN_LENGTH = 4

/**
 * Single responsibility: user-chip → StaffPicker → PIN overlay for switching
 * the attributed staff member mid-session (client-prd §3.4, US-003).
 * Mirrors StaffLogin's picker→PIN pattern via the shared StaffPicker
 * component, backed by StaffDirectoryContext instead of a direct API call.
 */
export interface SwitchUserProps {
  open: boolean
  onClose: () => void
}

export function SwitchUser({ open, onClose }: SwitchUserProps) {
  const { roster, login } = useStaffDirectory()
  const [selected, setSelected] = useState<StaffRosterItem | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function close(): void {
    setSelected(null)
    setPin('')
    setError(null)
    onClose()
  }

  function pick(item: StaffPickerItem): void {
    setSelected(roster.find((s) => s.id === item.id) ?? null)
    setPin('')
    setError(null)
  }

  async function submit(candidate: string): Promise<void> {
    if (!selected) return
    setSubmitting(true)
    try {
      await login(selected.id, candidate)
      close()
    } catch {
      setPin('')
      setError(t('auth.login.wrongPin'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleDigit(digit: number): void {
    if (submitting || pin.length >= PIN_LENGTH) return
    setError(null)
    const next = pin + String(digit)
    setPin(next)
    if (next.length === PIN_LENGTH) void submit(next)
  }

  function handleDelete(): void {
    setError(null)
    setPin((current) => current.slice(0, -1))
  }

  return (
    <Sheet open={open} onClose={close} title={t('auth.login.title')}>
      {!selected ? (
        <StaffPicker staff={roster} onPick={pick} />
      ) : (
        <div className="flex flex-col items-center gap-4">
          <h3 className="text-[16px] font-bold">{selected.name}</h3>
          <PinPad filled={pin.length} onDigit={handleDigit} onDelete={handleDelete} />
          {error && (
            <p role="alert" className="text-[13.5px] font-semibold text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Sheet>
  )
}
