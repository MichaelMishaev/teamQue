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
const PASSWORD_LENGTH = 4

export interface CreateCourtSheetProps {
  open: boolean
  onClose: () => void
  onSubmit: (name: string, password?: string) => void
  /** Pre-formatted message from the parent; null when the last attempt was clean. */
  error: string | null
  busy: boolean
}

export function CreateCourtSheet({ open, onClose, onSubmit, error, busy }: CreateCourtSheetProps) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const trimmed = name.trim()
  const passwordValid = password === '' || /^\d{4}$/.test(password)

  function close(): void {
    setName('')
    setPassword('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={close} title={t('home.create.sheetTitle')}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (trimmed !== '' && passwordValid && !busy) onSubmit(trimmed, password === '' ? undefined : password)
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

        <label htmlFor="field-password" className="flex flex-col gap-1 text-[13px] text-muted">
          {t('home.create.passwordLabel')}
        </label>
        <input
          id="field-password"
          value={password}
          onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, PASSWORD_LENGTH))}
          inputMode="numeric"
          autoComplete="off"
          aria-describedby="field-password-hint"
          maxLength={PASSWORD_LENGTH}
          type="password"
          dir="ltr"
          className="min-h-[var(--touch-target-min)] rounded-xl border border-line bg-surface-2 px-3 text-[15px] text-ink outline-none"
        />
        <span id="field-password-hint" className="-mt-3 text-[13px] text-muted">{t('home.create.passwordHint')}</span>
        {!passwordValid && <span role="alert" className="-mt-3 text-[13px] font-semibold text-danger">{t('home.create.passwordInvalid')}</span>}

        {error !== null && (
          <p role="alert" className="text-[13px] font-semibold text-danger">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="big" disabled={trimmed === '' || !passwordValid || busy}>
          {t('home.create.submit')}
        </Button>
      </form>
    </Sheet>
  )
}
