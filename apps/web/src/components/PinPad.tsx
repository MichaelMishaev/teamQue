import { t } from '@/i18n'
import { cn } from '@/lib/cn'
import { formatClock } from '@/lib/time'

/**
 * Single responsibility: 4-digit PIN entry — dots + keypad. Reused by center unlock
 * and staff login (client-prd §3.4). Digits render LTR; lockout counts down inline.
 */

export interface PinPadProps {
  filled: number
  length?: number
  lockedForSec?: number
  onDigit?: (digit: number) => void
  onDelete?: () => void
}

const KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

export function PinPad({ filled, length = 4, lockedForSec, onDigit, onDelete }: PinPadProps) {
  const locked = lockedForSec !== undefined && lockedForSec > 0
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-4" role="status" aria-label={t('pin.enterPin')}>
        {Array.from({ length }, (_, i) => (
          <i
            key={i}
            className={cn(
              'block size-3.5 rounded-full border-[1.5px] border-muted',
              !locked && i < filled && 'border-accent bg-accent',
            )}
          />
        ))}
      </div>

      {locked ? (
        <p className="tabular text-[13.5px] font-semibold text-danger">
          {t('pin.lockout', { time: formatClock(lockedForSec) })}
        </p>
      ) : (
        <div dir="ltr" className="grid grid-cols-3 gap-3.5">
          {KEYS.map((d) => (
            <PinKey key={d} onClick={() => onDigit?.(d)}>{d}</PinKey>
          ))}
          <span />
          <PinKey onClick={() => onDigit?.(0)}>0</PinKey>
          <PinKey onClick={onDelete} label={t('pin.delete')}>⌫</PinKey>
        </div>
      )}
    </div>
  )
}

function PinKey({ children, onClick, label }: { children: React.ReactNode; onClick?: (() => void) | undefined; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="tabular flex size-[72px] items-center justify-center rounded-full border border-line bg-surface font-mono text-[26px]"
    >
      {children}
    </button>
  )
}
