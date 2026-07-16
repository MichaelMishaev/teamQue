import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { t } from '@/i18n'

/**
 * Single responsibility: first-mutation identity prompt (open-fields spec
 * §5) — one text input seeded with a suggested nickname + confirm. Opened
 * by VisitorProvider the first time a gated action runs without identity;
 * spectators never see it.
 */
export interface VisitorNicknameSheetProps {
  open: boolean
  suggestion: string
  onSubmit(nickname: string): Promise<void>
  onClose(): void
}

export function VisitorNicknameSheet({ open, suggestion, onSubmit, onClose }: VisitorNicknameSheetProps) {
  const [nickname, setNickname] = useState(suggestion)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm(): Promise<void> {
    const trimmed = nickname.trim()
    if (trimmed.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(trimmed)
    } catch {
      setError(t('visitor.sheet.error'))
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('visitor.sheet.title')}>
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-muted">{t('visitor.sheet.hint')}</p>
        <input
          type="text"
          value={nickname}
          maxLength={30}
          onChange={(event) => setNickname(event.target.value)}
          placeholder={t('visitor.sheet.placeholder')}
          className="min-h-[var(--touch-target-min)] rounded-lg border border-line bg-surface px-3 text-[16px]"
        />
        {error && (
          <p role="alert" className="text-[13.5px] font-semibold text-danger">
            {error}
          </p>
        )}
        <Button
          variant="primary"
          size="big"
          onClick={() => void handleConfirm()}
          disabled={submitting || nickname.trim().length === 0}
        >
          {t('visitor.sheet.confirm')}
        </Button>
      </div>
    </Dialog>
  )
}
