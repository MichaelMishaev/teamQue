import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { t } from '@/i18n'

/**
 * Single responsibility: the name-only "create court" bottom sheet on '/' —
 * collects a court name and hands it up. Errors are shown inline and the typed
 * name survives them, so a throttled retry doesn't lose the user's input.
 */

/** Mirrors createFieldSchema's cap (packages/shared/src/requests.ts). */
const NAME_MAX_LENGTH = 40

export interface CreateCourtSheetProps {
  open: boolean
  onClose: () => void
  onSubmit: (name: string) => void
  /** Pre-formatted message from the parent; null when the last attempt was clean. */
  error: string | null
  busy: boolean
}

export function CreateCourtSheet({ open, onClose, onSubmit, error, busy }: CreateCourtSheetProps) {
  const [name, setName] = useState('')
  const trimmed = name.trim()

  function close(): void {
    setName('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={close} title={t('home.create.sheetTitle')}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (trimmed !== '' && !busy) onSubmit(trimmed)
        }}
      >
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          {t('home.create.nameLabel')}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            className="min-h-[var(--touch-target-min)] rounded-xl border border-line bg-surface-2 px-3 text-[15px] text-ink outline-none"
          />
        </label>

        {error !== null && (
          <p role="alert" className="text-[13px] font-semibold text-danger">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="big" disabled={trimmed === '' || busy}>
          {t('home.create.submit')}
        </Button>
      </form>
    </Sheet>
  )
}
