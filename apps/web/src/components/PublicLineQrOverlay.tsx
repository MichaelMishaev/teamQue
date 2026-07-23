/**
 * Single responsibility: the full-screen QR handoff surface — the staff
 * member taps the player-view button, holds the phone up, a teen scans the
 * code and lands on the read-only public line. Presentational: the QR is a
 * committed static asset (see the spec: the public URL is a fixed constant),
 * and the only behavior is closing via the back button or Escape.
 */
import { useEffect, useRef } from 'react'
import publicLineQr from '@/assets/public-line-qr.svg'
import { t } from '@/i18n'
import { PUBLIC_LINE_URL } from '@/lib/route'

export function PublicLineQrOverlay({ onClose }: { onClose: () => void }) {
  const backRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    backRef.current?.focus()
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('publicLine.qr.dialogLabel')}
      className="fixed inset-0 z-40 flex flex-col bg-bg"
    >
      <header className="flex min-h-[var(--touch-target-min)] items-center p-3">
        <button
          ref={backRef}
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[var(--touch-target-min)] items-center gap-1 rounded-lg px-2.5 text-[14px] font-semibold text-muted"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-4 w-4 shrink-0 rtl:-scale-x-100"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18 9 12l6-6" />
          </svg>
          <span>{t('publicLine.qr.back')}</span>
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6 pb-14 text-center">
        <div>
          <h2 className="text-[17px] font-bold text-ink">{t('publicLine.title')}</h2>
          <p className="mt-1 text-[24px] font-bold text-ink">{t('publicLine.qr.instruction')}</p>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-lg">
          <img src={publicLineQr} alt="" className="block h-64 w-64 max-w-full" />
        </div>

        <bdi dir="ltr" className="text-[13px] text-muted tabular-nums">
          {PUBLIC_LINE_URL}
        </bdi>

        <span className="rounded-full border border-accent/50 bg-accent-dim px-4 py-1.5 text-[13px] font-semibold text-accent">
          {t('publicLine.realtime')} · {t('publicLine.readOnly')}
        </span>
      </div>
    </div>
  )
}
