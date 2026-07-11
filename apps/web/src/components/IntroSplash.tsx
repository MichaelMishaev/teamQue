import { useState, type CSSProperties } from 'react'
import { cn } from '@/lib/cn'

const DOT_COUNT = 4
const DOT_STAGGER_MS = 80
const ENTRANCE_MS = 400
const PULSE_DELAY_MS = 450
const PULSE_MS = 300

function dotStyle(index: number): CSSProperties {
  if (index === 0) {
    return {
      animation: `intro-dot-in ${ENTRANCE_MS}ms ease-out both, intro-pulse ${PULSE_MS}ms ease-in-out ${PULSE_DELAY_MS}ms`,
    }
  }
  return {
    animation: `intro-dot-in ${ENTRANCE_MS}ms ease-out ${index * DOT_STAGGER_MS}ms both`,
  }
}

/**
 * Single responsibility: brief animated splash shown once when the app mounts
 * — the four-dot queue logo settles into place (front dot pulses, matching
 * design.md's "front of the line gets the accent" rule), then the whole
 * overlay fades to reveal the app underneath. Mobbin-inspired (Pinterest/
 * Shopee/Tubi: centered logo on a solid brand background, ~1-1.5s, no text).
 * Unmounts itself on its own fade-out `animationend` — checking
 * target === currentTarget so a bubbled child dot animation doesn't trigger
 * an early unmount.
 */
export function IntroSplash() {
  const [visible, setVisible] = useState(true)
  if (!visible) return null

  return (
    <div
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setVisible(false)
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg"
      style={{ animation: 'intro-overlay-out 1150ms ease forwards' }}
    >
      <div className="flex items-center gap-3">
        {Array.from({ length: DOT_COUNT }, (_, i) => (
          <span
            key={i}
            className={cn('h-4 w-4 rounded-full', i === 0 ? 'bg-accent' : 'bg-accent-dim')}
            style={dotStyle(i)}
          />
        ))}
      </div>
    </div>
  )
}
