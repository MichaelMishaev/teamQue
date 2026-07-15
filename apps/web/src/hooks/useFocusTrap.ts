import { useEffect, useRef, type RefObject } from 'react'

/**
 * Single responsibility: basic focus trap + Escape-to-close for the
 * hand-rolled Sheet/Dialog overlays (design.md — no Radix dependency needed
 * for these). Focuses the panel on open, cycles Tab within it, restores
 * focus to the trigger on close.
 *
 * onClose is read through a ref so an unstable inline callback (callers pass
 * `onClose={() => ...}`, recreated on every render — e.g. App's 1s clock tick)
 * does not re-run the effect. Re-running would re-grab panel focus and steal it
 * from an input inside the sheet, firing its onBlur — the "rename just blinks"
 * bug.
 */
export function useFocusTrap(open: boolean, onClose: () => void, panelRef: RefObject<HTMLElement | null>): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [open, panelRef])
}
