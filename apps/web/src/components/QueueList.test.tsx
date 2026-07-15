import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { QueueEntryView } from 'shared'
import { QueueList } from './QueueList'
import { SessionActionsContext, type SessionActions } from '@/state/SessionActions'

// jsdom has no PointerEvent constructor, so testing-library's fireEvent.pointer*
// falls back to a bare Event that drops clientY. MouseEvent reads the same
// MouseEventInit shape we rely on (clientY only), so alias it in.
if (typeof window.PointerEvent === 'undefined') {
  window.PointerEvent = MouseEvent as unknown as typeof PointerEvent
}

function entry(
  id: string,
  name: string,
  position: number,
  stats: Pick<QueueEntryView['team'], 'gamesToday' | 'lastPlayedAt'> = { gamesToday: 0, lastPlayedAt: null },
): QueueEntryView {
  return { id, position, team: { id: `${id}-cap`, name, nickname: null, ...stats } }
}

function renderQueueList(queue: QueueEntryView[], opts: { matchDurationSec?: number; baseSec?: number } = {}) {
  const actions: SessionActions = {
    addToLine: vi.fn(),
    searchTeams: vi.fn().mockResolvedValue([]),
    reorderLine: vi.fn().mockResolvedValue(undefined),
    moveTop: vi.fn().mockResolvedValue(undefined),
    moveBottom: vi.fn().mockResolvedValue(undefined),
    removeFromLine: vi.fn(),
    startMatch: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    finish: vi.fn(),
    extend: vi.fn(),
    replay: vi.fn(),
    undo: vi.fn(),
    openSession: vi.fn(),
    closeSession: vi.fn(),
    updateDuration: vi.fn(),
    updateTeam: vi.fn(),
  }
  const result = render(
    <SessionActionsContext.Provider value={actions}>
      <QueueList queue={queue} matchDurationSec={opts.matchDurationSec ?? 480} baseSec={opts.baseSec ?? 0} />
    </SessionActionsContext.Provider>,
  )
  return { actions, container: result.container, rerender: result.rerender }
}

function mockRect(el: HTMLElement, rect: { top: number; height: number }): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    top: rect.top,
    height: rect.height,
    left: 0,
    width: 300,
    right: 300,
    bottom: rect.top + rect.height,
    x: 0,
    y: rect.top,
    toJSON: () => ({}),
  } as DOMRect)
}

describe('QueueList', () => {
  it('renders every line entry as a single-team row, front two marked next', () => {
    const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2), entry('e3', 'ג', 3)]
    renderQueueList(queue)
    expect(screen.getAllByText('הבא')).toHaveLength(2) // both halves of the imminent match are marked next
    expect(screen.getByText('3')).toBeDefined() // third row shows its position, not "הבא"
  })

  it('keeps the selected teen\'s last-played time visible after they enter the queue', () => {
    const queue = [entry('e1', 'טורי', 1, { gamesToday: 1, lastPlayedAt: '2026-07-12T06:16:00.000Z' })]

    renderQueueList(queue)

    expect(screen.getByText('· 1 היום')).toBeDefined()
    expect(screen.getByText('09:16')).toBeDefined()
  })

  it('opens QueueActionsSheet for the row whose ⋯ was tapped', () => {
    const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2)]
    renderQueueList(queue)
    const menuButtons = screen.getAllByRole('button')
    fireEvent.click(menuButtons[2]!) // second row's ⋯ (index 0 is the pair's grip handle, index 1 is the first row's ⋯)
    expect(screen.getByRole('heading', { name: 'ב' })).toBeDefined() // sheet title uses the picked entry's team name
  })

  describe('predicted pairing', () => {
    it('shows a games-ahead/eta line for every pair after the front two', () => {
      const queue = [entry('e1', 'טל', 1), entry('e2', 'נדב', 2), entry('e3', 'רון', 3), entry('e4', 'חלח', 4)]
      renderQueueList(queue, { matchDurationSec: 480, baseSec: 0 })
      expect(screen.getAllByText('משחק אחד לפניך')).toHaveLength(2)
      expect(screen.getAllByText('9')).toHaveLength(2)
    })

    it('marks a trailing odd entry as waiting for a pair with an approximate eta', () => {
      const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2), entry('e3', 'ג', 3)]
      renderQueueList(queue, { matchDurationSec: 480, baseSec: 0 })
      expect(screen.getByText('ממתין/ה לזוג')).toBeDefined()
      expect(screen.getByText('(משוער)')).toBeDefined()
    })

    it('folds the live match remaining time into every eta via baseSec', () => {
      const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2), entry('e3', 'ג', 3), entry('e4', 'ד', 4)]
      renderQueueList(queue, { matchDurationSec: 480, baseSec: 200 })
      // (200 + 480 + 60) / 60 = 12.33 -> rounds to 12 (both entries in the pair share the same eta)
      expect(screen.getAllByText('12')).toHaveLength(2)
    })

    it('shows waiting-for-pair (not a "0 games ahead" line) for a lone entry with no partner yet', () => {
      const queue = [entry('e1', 'א', 1)]
      renderQueueList(queue, { matchDurationSec: 480, baseSec: 0 })
      expect(screen.getByText('ממתין/ה לזוג')).toBeDefined()
      expect(screen.queryByText('הבא')).toBeNull()
      expect(screen.queryByText(/לפניך/)).toBeNull()
    })
  })

  describe('pair drag gesture — arming', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    function fourEntryQueue(): QueueEntryView[] {
      return [entry('e1', 'א', 1), entry('e2', 'ב', 2), entry('e3', 'ג', 3), entry('e4', 'ד', 4)]
    }

    it('arms the grip on the first tap', () => {
      renderQueueList(fourEntryQueue())
      const grip = screen.getByRole('button', { name: /^הזז את זוג 2/ })
      fireEvent.pointerDown(grip, { clientY: 10 })
      expect(grip.className).toContain('bg-warn')
    })

    it('returns to idle when the double-tap window elapses without a second tap', () => {
      renderQueueList(fourEntryQueue())
      const grip = screen.getByRole('button', { name: /^הזז את זוג 2/ })
      fireEvent.pointerDown(grip, { clientY: 10 })
      vi.advanceTimersByTime(400)
      expect(grip.className).not.toContain('bg-warn')
    })

    it('moves to holding on a second tap of the same grip within the window', () => {
      renderQueueList(fourEntryQueue())
      const grip = screen.getByRole('button', { name: /^הזז את זוג 2/ })
      fireEvent.pointerDown(grip, { clientY: 10 })
      fireEvent.pointerDown(grip, { clientY: 10 })
      expect(grip.className).toContain('bg-accent-dim')
    })

    it('cancels back to idle if the pointer is released before the hold completes', () => {
      renderQueueList(fourEntryQueue())
      const grip = screen.getByRole('button', { name: /^הזז את זוג 2/ })
      fireEvent.pointerDown(grip, { clientY: 10 })
      fireEvent.pointerDown(grip, { clientY: 10 })
      fireEvent.pointerUp(window, { clientY: 10 })
      expect(grip.className).not.toContain('bg-accent-dim')
    })

    it('clears the holding highlight once the hold duration completes', () => {
      renderQueueList(fourEntryQueue())
      const grip = screen.getByRole('button', { name: /^הזז את זוג 2/ })
      fireEvent.pointerDown(grip, { clientY: 10 })
      fireEvent.pointerDown(grip, { clientY: 10 })
      vi.advanceTimersByTime(400)
      expect(grip.className).not.toContain('bg-accent-dim')
    })

    it('does not let a stale listener from an abandoned hold cancel a fresh gesture on another grip', () => {
      renderQueueList(fourEntryQueue())
      const grip1 = screen.getByRole('button', { name: /^הזז את זוג 1/ })
      const grip2 = screen.getByRole('button', { name: /^הזז את זוג 2/ })

      fireEvent.pointerDown(grip1, { clientY: 10 })
      fireEvent.pointerDown(grip1, { clientY: 10 }) // grip1 now holding
      fireEvent.pointerDown(grip2, { clientY: 10 }) // switches to armed(grip2) before grip1's hold completes

      fireEvent.pointerUp(window, { clientY: 10 }) // a stray release that must NOT touch grip2's fresh armed state

      expect(grip2.className).toContain('bg-warn')
    })
  })

  describe('pair drag gesture — dragging', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    function sixEntryQueue(): QueueEntryView[] {
      return [
        entry('e1', 'א', 1),
        entry('e2', 'ב', 2),
        entry('e3', 'ג', 3),
        entry('e4', 'ד', 4),
        entry('e5', 'ה', 5),
        entry('e6', 'ו', 6),
      ]
    }

    function eightEntryQueue(): QueueEntryView[] {
      return [...sixEntryQueue(), entry('e7', 'ז', 7), entry('e8', 'ח', 8)]
    }

    it('cancels the drag if the pointer releases before the hold completes', () => {
      const { actions } = renderQueueList(sixEntryQueue())
      const grip = screen.getByRole('button', { name: /^הזז את זוג 2/ })
      fireEvent.pointerDown(grip, { clientY: 10 })
      fireEvent.pointerDown(grip, { clientY: 10 })
      vi.advanceTimersByTime(200)
      fireEvent.pointerUp(window, { clientY: 10 })
      vi.advanceTimersByTime(400)
      expect(actions.reorderLine).not.toHaveBeenCalled()
    })

    it('does not reorder when the pair is dropped back at its original position', () => {
      const { actions, container } = renderQueueList(sixEntryQueue())
      const groupEls = [...container.querySelectorAll<HTMLElement>('[data-group-id]')]
      mockRect(groupEls[1]!, { top: 148, height: 132 })

      const grip1 = groupEls[0]!.querySelector('button') as HTMLElement
      fireEvent.pointerDown(grip1, { clientY: 10 })
      fireEvent.pointerDown(grip1, { clientY: 10 })
      vi.advanceTimersByTime(400)
      fireEvent.pointerMove(window, { clientY: 10 })
      fireEvent.pointerUp(window, { clientY: 10 })

      expect(actions.reorderLine).not.toHaveBeenCalled()
    })

    it('opens a confirmation naming the mover and whoever lands in its old slot, and only reorders after confirming', () => {
      const { actions, container } = renderQueueList(sixEntryQueue())
      const groupEls = [...container.querySelectorAll<HTMLElement>('[data-group-id]')]
      expect(groupEls).toHaveLength(3)
      mockRect(groupEls[1]!, { top: 148, height: 132 })
      mockRect(groupEls[2]!, { top: 296, height: 132 })

      const grip1 = groupEls[0]!.querySelector('button') as HTMLElement
      fireEvent.pointerDown(grip1, { clientY: 10 })
      fireEvent.pointerDown(grip1, { clientY: 10 })
      vi.advanceTimersByTime(400)
      fireEvent.pointerMove(window, { clientY: 250 }) // past group2's midpoint (214), before group3's (362)
      fireEvent.pointerUp(window, { clientY: 250 })

      expect(screen.getByText('להחליף בין א / ב ⇄ ג / ד?')).toBeDefined()
      expect(actions.reorderLine).not.toHaveBeenCalled()

      fireEvent.click(screen.getByText('אישור'))
      expect(actions.reorderLine).toHaveBeenCalledWith(['e3', 'e4', 'e1', 'e2', 'e5', 'e6'])
    })

    it('still names just the immediate neighbor (not every displaced pair) for a multi-slot drag, but reorders everyone correctly on confirm', () => {
      const { actions, container } = renderQueueList(eightEntryQueue())
      const groupEls = [...container.querySelectorAll<HTMLElement>('[data-group-id]')]
      expect(groupEls).toHaveLength(4)
      mockRect(groupEls[1]!, { top: 148, height: 132 })
      mockRect(groupEls[2]!, { top: 296, height: 132 })
      mockRect(groupEls[3]!, { top: 444, height: 132 })

      const grip1 = groupEls[0]!.querySelector('button') as HTMLElement
      fireEvent.pointerDown(grip1, { clientY: 10 })
      fireEvent.pointerDown(grip1, { clientY: 10 })
      vi.advanceTimersByTime(400)
      fireEvent.pointerMove(window, { clientY: 400 }) // past group2 (214) and group3 (362) midpoints, before group4's (510) -> toIndex 2
      fireEvent.pointerUp(window, { clientY: 400 })

      // Same title as the adjacent case above — the occupant depends only on
      // fromIndex, not on how far the drag traveled. Group3 ("ה"/"ו") also
      // shifts on confirm even though it's never named in the dialog.
      expect(screen.getByText('להחליף בין א / ב ⇄ ג / ד?')).toBeDefined()
      expect(actions.reorderLine).not.toHaveBeenCalled()

      fireEvent.click(screen.getByText('אישור'))
      expect(actions.reorderLine).toHaveBeenCalledWith(['e3', 'e4', 'e5', 'e6', 'e1', 'e2', 'e7', 'e8'])
    })

    it('cancel restores the original order, never calls reorderLine, and closes the dialog', () => {
      const { actions, container } = renderQueueList(sixEntryQueue())
      const groupEls = [...container.querySelectorAll<HTMLElement>('[data-group-id]')]
      mockRect(groupEls[1]!, { top: 148, height: 132 })
      mockRect(groupEls[2]!, { top: 296, height: 132 })

      const grip1 = groupEls[0]!.querySelector('button') as HTMLElement
      fireEvent.pointerDown(grip1, { clientY: 10 })
      fireEvent.pointerDown(grip1, { clientY: 10 })
      vi.advanceTimersByTime(400)
      fireEvent.pointerMove(window, { clientY: 250 })
      fireEvent.pointerUp(window, { clientY: 250 })

      fireEvent.click(screen.getByText('ביטול'))
      vi.advanceTimersByTime(150)

      expect(actions.reorderLine).not.toHaveBeenCalled()
      expect(screen.queryByText('להחליף בין א / ב ⇄ ג / ד?')).toBeNull()
    })

    it('uses the latest queue state at confirm time, not the stale state from when the drag started', () => {
      const { actions, container, rerender } = renderQueueList(sixEntryQueue())
      const groupEls = [...container.querySelectorAll<HTMLElement>('[data-group-id]')]
      mockRect(groupEls[1]!, { top: 148, height: 132 })
      mockRect(groupEls[2]!, { top: 296, height: 132 })

      const grip1 = groupEls[0]!.querySelector('button') as HTMLElement
      fireEvent.pointerDown(grip1, { clientY: 10 })
      fireEvent.pointerDown(grip1, { clientY: 10 })
      vi.advanceTimersByTime(400)

      // Simulate a realtime snapshot update landing mid-drag: a new entry is added to the queue.
      const updatedQueue = [...sixEntryQueue(), entry('e7', 'ז', 7)]
      rerender(
        <SessionActionsContext.Provider value={actions}>
          <QueueList queue={updatedQueue} matchDurationSec={480} baseSec={0} />
        </SessionActionsContext.Provider>,
      )

      fireEvent.pointerMove(window, { clientY: 250 })
      fireEvent.pointerUp(window, { clientY: 250 })
      fireEvent.click(screen.getByText('אישור'))

      expect(actions.reorderLine).toHaveBeenCalledWith(['e3', 'e4', 'e1', 'e2', 'e5', 'e6', 'e7'])
    })

    it('auto-scrolls the page when dragging near the bottom edge of the viewport', () => {
      // regression: see gh#2
      Object.defineProperty(window, 'innerHeight', { value: 400, configurable: true })
      const scrollBySpy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})

      const { container } = renderQueueList(sixEntryQueue())
      const groupEls = [...container.querySelectorAll<HTMLElement>('[data-group-id]')]
      mockRect(groupEls[1]!, { top: 148, height: 132 })
      mockRect(groupEls[2]!, { top: 296, height: 132 })

      const grip1 = groupEls[0]!.querySelector('button') as HTMLElement
      fireEvent.pointerDown(grip1, { clientY: 10 })
      fireEvent.pointerDown(grip1, { clientY: 10 })
      vi.advanceTimersByTime(400)

      // Pointer sits near the bottom edge of a 400px-tall viewport — a pair several
      // rows below (off-screen) can only ever be reached if this triggers a scroll.
      fireEvent.pointerMove(window, { clientY: 390 })

      expect(scrollBySpy).toHaveBeenCalled()
      const [scrollArg] = scrollBySpy.mock.calls[0] as unknown as [{ top: number }]
      expect(scrollArg.top).toBeGreaterThan(0)

      fireEvent.pointerUp(window, { clientY: 390 })
      scrollBySpy.mockRestore()
    })

    it('slides the placeholder and the passed-over sibling toward the live drop target before the drop', () => {
      const { container } = renderQueueList(sixEntryQueue())
      const groupEls = [...container.querySelectorAll<HTMLElement>('[data-group-id]')]
      mockRect(groupEls[0]!, { top: 0, height: 132 })
      mockRect(groupEls[1]!, { top: 148, height: 132 })
      mockRect(groupEls[2]!, { top: 296, height: 132 })

      const grip1 = groupEls[0]!.querySelector('button') as HTMLElement
      fireEvent.pointerDown(grip1, { clientY: 10 })
      fireEvent.pointerDown(grip1, { clientY: 10 })
      vi.advanceTimersByTime(400)
      fireEvent.pointerMove(window, { clientY: 250 }) // past group2's midpoint (214), before group3's (362) -> toIndex 1

      const placeholder = container.querySelector('[data-group-id="e1"]') as HTMLElement
      expect(placeholder.style.transform).toBe('translateY(148px)')

      const shiftedSibling = container.querySelector('[data-group-id="e3"]') as HTMLElement
      expect(shiftedSibling.style.transform).toBe('translateY(-148px)')

      const untouchedSibling = container.querySelector('[data-group-id="e5"]') as HTMLElement
      expect(untouchedSibling.style.transform).toBe('translateY(0px)')

      fireEvent.pointerUp(window, { clientY: 250 })
    })
  })

  describe('move-to-top/bottom confirmation', () => {
    // QueueRow's ⋯ button has aria-label={teamName} (QueueRow.tsx) — an exact,
    // unambiguous selector, since every test queue below uses distinct single-
    // letter team names.
    function openMenuFor(teamName: string): void {
      fireEvent.click(screen.getByRole('button', { name: teamName }))
    }

    it('opens a confirmation naming both entries for an adjacent move, and only calls moveTop after confirming', () => {
      const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2), entry('e3', 'ג', 3), entry('e4', 'ד', 4)]
      const { actions } = renderQueueList(queue)
      openMenuFor('ב')
      fireEvent.click(screen.getByText('לראש התור'))

      expect(screen.getByText('להחליף בין ב ⇄ א?')).toBeDefined()
      expect(actions.moveTop).not.toHaveBeenCalled()

      fireEvent.click(screen.getByText('אישור'))
      expect(actions.moveTop).toHaveBeenCalledWith('e2')
    })

    it('still names the immediate neighbor (not a count) for a multi-slot move to bottom, and only calls moveBottom after confirming', () => {
      const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2), entry('e3', 'ג', 3), entry('e4', 'ד', 4)]
      const { actions } = renderQueueList(queue)
      openMenuFor('א')
      fireEvent.click(screen.getByText('לסוף התור'))

      expect(screen.getByText('להחליף בין א ⇄ ב?')).toBeDefined()
      expect(actions.moveBottom).not.toHaveBeenCalled()

      fireEvent.click(screen.getByText('אישור'))
      expect(actions.moveBottom).toHaveBeenCalledWith('e1')
    })

    it('cancel closes the dialog and never calls moveTop/moveBottom', () => {
      const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2), entry('e3', 'ג', 3), entry('e4', 'ד', 4)]
      const { actions } = renderQueueList(queue)
      openMenuFor('ד')
      fireEvent.click(screen.getByText('לראש התור'))

      fireEvent.click(screen.getByText('ביטול'))
      expect(actions.moveTop).not.toHaveBeenCalled()
      expect(actions.moveBottom).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('requesting a move when the entry is already at that extreme opens no dialog and calls nothing', () => {
      const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2), entry('e3', 'ג', 3), entry('e4', 'ד', 4)]
      const { actions } = renderQueueList(queue)
      openMenuFor('א')
      fireEvent.click(screen.getByText('לראש התור'))

      expect(screen.queryByRole('dialog')).toBeNull()
      expect(actions.moveTop).not.toHaveBeenCalled()
    })
  })
})
