import { useRef, type MouseEvent as ReactMouseEvent } from 'react'

/**
 * Single responsibility: long-press detection for opening CaptainSheet from
 * a captain surface (US-023). Desktop gets the same affordance via
 * onContextMenu (right-click) so the sheet isn't touch-only.
 */
export interface UseLongPressHandlers {
  onTouchStart: () => void
  onTouchEnd: () => void
  onTouchMove: () => void
  onMouseDown: () => void
  onMouseUp: () => void
  onMouseLeave: () => void
  onContextMenu: (e: ReactMouseEvent) => void
}

export function useLongPress(onLongPress: () => void, delayMs = 500): UseLongPressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function start(): void {
    timer.current = setTimeout(onLongPress, delayMs)
  }
  function clear(): void {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  return {
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: clear,
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: clear,
    onContextMenu: (e) => {
      e.preventDefault()
      onLongPress()
    },
  }
}
