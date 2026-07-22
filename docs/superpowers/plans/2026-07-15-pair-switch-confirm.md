# Pair-move confirmation dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate `QueueList`'s pair drag-and-drop drop behind a blocking confirmation dialog (naming both pairs for an adjacent swap, or a shift count for a multi-slot move) instead of applying the reorder immediately with an undo toast.

**Architecture:** A new presentational `PairSwitchConfirmDialog` (no internal async state — `QueueList` already applies reorders optimistically and reverts on failure everywhere else). `QueueList`'s pointer-up handler stops live pointer tracking but leaves the drag visual frozen at the drop target, computes a `pendingSwitch` describing the pending move, and renders the dialog gated on it; Confirm applies the existing optimistic-reorder path, Cancel animates the frozen visual back to its original position.

**Tech Stack:** React 19, TypeScript (strict), Tailwind v4, Vitest + Testing Library (jsdom).

## Global Constraints

- TDD: write the failing test before the implementation for every task below (repo hard rule).
- TypeScript max-strict: no `any`, no non-null `!`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — optional props are omitted via conditional spread (`{...(cond ? { prop } : {})}`), never passed as literal `undefined`.
- i18n: zero hardcoded Hebrew strings in `.tsx` — every user-facing string goes through `apps/web/src/i18n/he.json` + `t()`.
- Tokens: components use semantic Tailwind utilities (`bg-accent`, `text-danger`, …) — never a raw hex value.
- Design spec: `docs/superpowers/specs/2026-07-15-pair-switch-confirm-design.md` — read it if any task instruction below is ambiguous.
- Test commands are run from the repo root: `pnpm --filter web vitest run <path>` for a single file, `pnpm typecheck` and `pnpm test` before considering the whole plan done.

---

### Task 1: `PairSwitchConfirmDialog` component

**Files:**
- Create: `apps/web/src/components/PairSwitchConfirmDialog.tsx`
- Create: `apps/web/src/components/PairSwitchConfirmDialog.test.tsx`
- Modify: `apps/web/src/i18n/he.json` (insert 5 keys immediately after the `"queue.pair.gripLabel"` line)

**Interfaces:**
- Consumes: `Dialog` (`apps/web/src/components/ui/dialog.tsx`) — `{ open: boolean; onClose: () => void; title?: string; children: ReactNode }`. `Button` (`apps/web/src/components/ui/button.tsx`) — `{ variant?: 'primary'|'secondary'|'danger'|'ghost'; className?: string; onClick?: () => void }`. `t(key: MessageKey, params?: Record<string, string|number>): string` (`apps/web/src/i18n`).
- Produces: `PairSwitchConfirmDialog({ open, onConfirm, onCancel, groupANames, direction, occupantNames, shiftCount }: PairSwitchConfirmDialogProps): JSX.Element`, exported from `apps/web/src/components/PairSwitchConfirmDialog.tsx`. Task 2 imports this component and these exact prop names.

- [ ] **Step 1: Write the failing test file**

```tsx
// apps/web/src/components/PairSwitchConfirmDialog.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PairSwitchConfirmDialog } from './PairSwitchConfirmDialog'

describe('PairSwitchConfirmDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <PairSwitchConfirmDialog
        open={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי', 'רון']}
        direction="down"
        occupantNames={['דני', 'עומר']}
        shiftCount={1}
      />,
    )
    expect(screen.queryByText(/יוסי/)).toBeNull()
  })

  it('shows a two-way switch title when occupantNames is provided (an adjacent, 1-slot move)', () => {
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי', 'רון']}
        direction="down"
        occupantNames={['דני', 'עומר']}
        shiftCount={1}
      />,
    )
    expect(screen.getByText('להחליף בין יוסי / רון ⇄ דני / עומר?')).toBeDefined()
  })

  it('shows a move-down-with-count title when occupantNames is null', () => {
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי', 'רון']}
        direction="down"
        occupantNames={null}
        shiftCount={3}
      />,
    )
    expect(screen.getByText('להזיז את יוסי / רון למטה? (עוד 3 זוגות יזוזו מקום)')).toBeDefined()
  })

  it('shows a move-up-with-count title when occupantNames is null and direction is up', () => {
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי', 'רון']}
        direction="up"
        occupantNames={null}
        shiftCount={2}
      />,
    )
    expect(screen.getByText('להזיז את יוסי / רון למעלה? (עוד 2 זוגות יזוזו מקום)')).toBeDefined()
  })

  it('does not call onConfirm until confirm is tapped', () => {
    const onConfirm = vi.fn()
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        groupANames={['א', 'ב']}
        direction="down"
        occupantNames={['ג', 'ד']}
        shiftCount={1}
      />,
    )
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm exactly once when confirm is tapped', () => {
    const onConfirm = vi.fn()
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        groupANames={['א', 'ב']}
        direction="down"
        occupantNames={['ג', 'ד']}
        shiftCount={1}
      />,
    )
    fireEvent.click(screen.getByText('אישור'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancel calls onCancel without ever calling onConfirm', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={onConfirm}
        onCancel={onCancel}
        groupANames={['א', 'ב']}
        direction="down"
        occupantNames={['ג', 'ד']}
        shiftCount={1}
      />,
    )
    fireEvent.click(screen.getByText('ביטול'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/components/PairSwitchConfirmDialog.test.tsx`
Expected: FAIL — `Failed to resolve import "./PairSwitchConfirmDialog"` (the component file doesn't exist yet).

- [ ] **Step 3: Add the 5 i18n keys**

In `apps/web/src/i18n/he.json`, immediately after the line `"queue.pair.gripLabel": "הזז את {label} — הקישו פעמיים והחזיקו כדי לגרור",`, add:

```json
  "queue.pairSwitch.confirmAdjacent": "להחליף בין {groupA} ⇄ {groupB}?",
  "queue.pairSwitch.confirmMultiDown": "להזיז את {groupA} למטה? (עוד {count} זוגות יזוזו מקום)",
  "queue.pairSwitch.confirmMultiUp": "להזיז את {groupA} למעלה? (עוד {count} זוגות יזוזו מקום)",
  "queue.pairSwitch.confirm": "אישור",
  "queue.pairSwitch.cancel": "ביטול",
```

- [ ] **Step 4: Write the component**

```tsx
// apps/web/src/components/PairSwitchConfirmDialog.tsx
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'

/**
 * Single responsibility: the one exception (besides RematchConfirmDialog) to
 * the no-popup policy (design.md §4) — requires explicit confirmation before
 * a pair drag-and-drop (docs/superpowers/specs/2026-07-13-queue-pair-move-
 * design.md) commits, since staff running the line are non-technical and a
 * drag can shift several pairs' positions at once
 * (docs/superpowers/specs/2026-07-15-pair-switch-confirm-design.md). Unlike
 * RematchConfirmDialog, there's no submitting/error state here — QueueList
 * already applies every reorder optimistically and reverts on failure, so
 * Confirm just closes this dialog and lets that existing path run.
 */
export interface PairSwitchConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  /** The dragged pair's team names, e.g. ["יוסי", "רון"]. */
  groupANames: string[]
  direction: 'up' | 'down'
  /** The one pair displaced by an adjacent (1-slot) move — null for a multi-slot move. */
  occupantNames: string[] | null
  /** How many other pairs shift by one slot — only shown when occupantNames is null. */
  shiftCount: number
}

export function PairSwitchConfirmDialog({
  open,
  onConfirm,
  onCancel,
  groupANames,
  direction,
  occupantNames,
  shiftCount,
}: PairSwitchConfirmDialogProps) {
  const groupA = groupANames.join(' / ')
  const title = occupantNames
    ? t('queue.pairSwitch.confirmAdjacent', { groupA, groupB: occupantNames.join(' / ') })
    : direction === 'up'
      ? t('queue.pairSwitch.confirmMultiUp', { groupA, count: shiftCount })
      : t('queue.pairSwitch.confirmMultiDown', { groupA, count: shiftCount })

  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <div className="flex gap-3">
        <Button className="flex-1" onClick={onCancel}>
          {t('queue.pairSwitch.cancel')}
        </Button>
        <Button className="flex-1" variant="primary" onClick={onConfirm}>
          {t('queue.pairSwitch.confirm')}
        </Button>
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/components/PairSwitchConfirmDialog.test.tsx`
Expected: PASS — all 7 tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/PairSwitchConfirmDialog.tsx apps/web/src/components/PairSwitchConfirmDialog.test.tsx apps/web/src/i18n/he.json
git commit -m "feat(web): add pair-switch confirmation dialog component"
```

---

### Task 2: `QueueList` — freeze on drop, confirm/cancel wiring

**Files:**
- Modify: `apps/web/src/components/QueueList.tsx`
- Modify: `apps/web/src/components/QueueList.test.tsx`
- Modify: `apps/web/src/i18n/he.json` (remove the now-orphaned `toast.pairMovedUp`/`toast.pairMovedDown` keys)

**Interfaces:**
- Consumes: `PairSwitchConfirmDialog` (Task 1) — `{ open, onConfirm, onCancel, groupANames, direction, occupantNames, shiftCount }` exactly as defined above.
- Produces: nothing new for further tasks — this is the last functional-code task; Task 3 is verification only.

This task replaces the immediate-apply-plus-undo-toast behavior in `onDragEnd` (the pointer-up handler for the imperative pair drag — distinct from `handleDragEnd`, which is dnd-kit's per-row drag callback and is untouched) with: freeze the drag visual, open the confirmation dialog, and apply/cancel from there.

**The math worth restating from the design doc:** dragging a pair by *N* slots always displaces exactly *N* other pairs by one slot each. Magnitude 1 is a genuine two-way swap (name both pairs); anything more shifts several pairs, so the dialog states a count instead. The one displaced pair's index in the post-removal (`remaining`) array is `toIndex - 1` when moving down (`toIndex > fromIndex`) or `toIndex` when moving up — both only meaningful when magnitude is exactly 1.

- [ ] **Step 1: Rewrite the changed/new tests**

Replace the entire `describe('pair drag gesture — dragging', ...)` block (currently the last `describe` in the file, right before the file's closing `})`) with:

```tsx
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

    it('opens a two-way switch confirmation on drop, and only reorders after confirming', () => {
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

    it('shows a multi-pair-shift count instead of a two-way switch when dragging across more than one slot', () => {
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

      expect(screen.getByText('להזיז את א / ב למטה? (עוד 2 זוגות יזוזו מקום)')).toBeDefined()
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/components/QueueList.test.tsx`
Expected: FAIL — drop currently reorders immediately (no dialog text to find), and `PairSwitchConfirmDialog` isn't wired in yet.

- [ ] **Step 3: Remove the two orphaned toast keys**

In `apps/web/src/i18n/he.json`, delete these two lines (they become unused once Step 4 removes their only call site):

```json
  "toast.pairMovedUp": "{names} הוזז/ה למעלה",
  "toast.pairMovedDown": "{names} הוזז/ה למטה",
```

- [ ] **Step 4: Rewrite `QueueList.tsx`**

Replace the full contents of `apps/web/src/components/QueueList.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { QueueEntryView } from 'shared'
import { PairSwitchConfirmDialog } from '@/components/PairSwitchConfirmDialog'
import { QueuePairGroup, type QueuePairGroupVariant } from '@/components/QueuePairGroup'
import { QueueRow } from '@/components/QueueRow'
import { QueueActionsSheet } from '@/components/QueueActionsSheet'
import { t } from '@/i18n'
import {
  pairGestureReducer,
  DOUBLE_TAP_WINDOW_MS,
  HOLD_MS,
  indexForPointerY,
  computeReflow,
  type PairGestureState,
  type RectLike,
} from '@/lib/pair-drag-gesture'
import { buildPairGroups, reorderGroups } from '@/lib/queue-pairing'
import { formatTimeOfDay } from '@/lib/time'
import { useSessionActions } from '@/state/SessionActions'

/**
 * Single responsibility: the line — touch-first drag-to-reorder (dnd-kit,
 * handle-only listeners so the page still scrolls). Consecutive entries are
 * grouped into predicted pairs (QueuePairGroup) with a games-ahead/eta
 * estimate per row past the front pair (docs/superpowers/specs/2026-07-13-
 * queue-pairing-and-eta-design.md). ⋯ opens QueueActionsSheet. Reorder is
 * optimistic: applied to local order immediately, reverted if
 * SessionActions rejects it (client-prd §5, US-030).
 *
 * Each pair group also carries a double-tap-and-hold-then-drag gesture on
 * its own grip handle, letting staff move the whole pair as a block
 * (docs/superpowers/specs/2026-07-13-queue-pair-move-design.md). While
 * dragging, the other pair cards live-reflow (CSS transform, no DOM
 * reordering) to open a gap at the current drop target
 * (docs/superpowers/specs/2026-07-13-queue-pair-drag-live-reflow-design.md).
 * Releasing the pointer freezes that visual and opens
 * PairSwitchConfirmDialog rather than committing immediately — staff must
 * explicitly confirm before the reorder is applied
 * (docs/superpowers/specs/2026-07-15-pair-switch-confirm-design.md).
 */
export interface QueueListProps {
  queue: QueueEntryView[]
  matchDurationSec: number
  baseSec: number
  onError?: (message: string) => void
}

/** Pointer distance from a viewport edge that triggers auto-scroll during a pair drag. */
const DRAG_SCROLL_EDGE_PX = 80
/** Scroll amount per pointermove while the pointer sits in the edge zone. */
const DRAG_SCROLL_STEP_PX = 16
/** Cancel snap-back duration — matches the reflow's own CSS transition. */
const CANCEL_ANIMATION_MS = 150

function groupIdOf(group: { pairIndex: number; entryIds: string[] }): string {
  return group.entryIds[0] ?? `pair-${group.pairIndex}`
}

function namesOf(group: { entryIds: string[] }, byId: Map<string, QueueEntryView>): string[] {
  return group.entryIds.map((id) => byId.get(id)?.team.name).filter((name): name is string => Boolean(name))
}

interface PendingSwitch {
  groupId: string
  toIndex: number
  groupANames: string[]
  direction: 'up' | 'down'
  occupantNames: string[] | null
  shiftCount: number
}

export function QueueList({ queue, matchDurationSec, baseSec, onError }: QueueListProps) {
  const actions = useSessionActions()
  const [orderIds, setOrderIds] = useState<string[]>(() => queue.map((e) => e.id))
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null)

  const gestureRef = useRef<PairGestureState>({ phase: 'idle' })
  const [gripVisual, setGripVisual] = useState<{ groupId: string; phase: 'armed' | 'holding' } | null>(null)
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdCleanupRef = useRef<(() => void) | null>(null)
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const queueRef = useRef<HTMLDivElement>(null)
  const floatingRef = useRef<HTMLDivElement>(null)
  const [dragGroupId, setDragGroupId] = useState<string | null>(null)
  const dragGroupIdRef = useRef<string | null>(null)
  const dragOverIndexRef = useRef(0)
  const [dragOverIndex, setDragOverIndex] = useState(0)
  const dragFromIndexRef = useRef(0)
  const dragRectsRef = useRef<RectLike[]>([])
  const dragScrollStartRef = useRef(0)
  const dragStartRef = useRef<{ top: number; left: number; width: number; height: number; clientY: number } | null>(null)
  const [pendingSwitch, setPendingSwitch] = useState<PendingSwitch | null>(null)

  useEffect(() => {
    setOrderIds(queue.map((e) => e.id))
  }, [queue])

  function teardownActiveHold(): void {
    holdCleanupRef.current?.()
    holdCleanupRef.current = null
  }

  useEffect(() => {
    return () => {
      teardownActiveHold()
      if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current)
      if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current)
    }
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderIds.indexOf(String(active.id))
    const newIndex = orderIds.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const previous = orderIds
    const next = arrayMove(orderIds, oldIndex, newIndex)
    setOrderIds(next)
    actions.reorderLine(next).catch(() => {
      setOrderIds(previous)
      onError?.(t('queue.actions.error'))
    })
  }

  const byId = new Map(queue.map((e) => [e.id, e]))
  const orderedEntries = orderIds.map((id) => byId.get(id)).filter((e): e is QueueEntryView => e !== undefined)
  const menuEntry = menuEntryId ? (byId.get(menuEntryId) ?? null) : null
  const pairGroups = buildPairGroups(
    orderedEntries.map((e) => e.id),
    baseSec,
    matchDurationSec,
  )

  const latestRef = useRef({ pairGroups, orderIds, byId, actions, onError })
  latestRef.current = { pairGroups, orderIds, byId, actions, onError }

  function applyGestureTransition(event: Parameters<typeof pairGestureReducer>[1]): PairGestureState {
    const next = pairGestureReducer(gestureRef.current, event)
    gestureRef.current = next
    if (next.phase === 'armed' || next.phase === 'holding') {
      setGripVisual({ groupId: next.groupId, phase: next.phase })
    } else {
      setGripVisual(null)
    }
    return next
  }

  function handleGripPointerDown(groupId: string, event: ReactPointerEvent<HTMLButtonElement>): void {
    event.preventDefault()
    if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current)
    if (gestureRef.current.phase === 'holding') teardownActiveHold()
    const next = applyGestureTransition({ type: 'GRIP_DOWN', groupId })

    if (next.phase === 'armed') {
      doubleTapTimerRef.current = setTimeout(() => {
        flushSync(() => applyGestureTransition({ type: 'DOUBLE_TAP_TIMEOUT' }))
      }, DOUBLE_TAP_WINDOW_MS)
      return
    }

    if (next.phase === 'holding') {
      const startClientY = event.clientY
      const cancelHold = (): void => {
        window.removeEventListener('pointerup', cancelHold)
        window.removeEventListener('pointermove', moveDuringHold)
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
        holdCleanupRef.current = null
        flushSync(() => applyGestureTransition({ type: 'CANCEL' }))
      }
      const moveDuringHold = (moveEvent: PointerEvent): void => {
        if (Math.abs(moveEvent.clientY - startClientY) > 8) cancelHold()
      }
      window.addEventListener('pointerup', cancelHold)
      window.addEventListener('pointermove', moveDuringHold)
      holdCleanupRef.current = () => {
        window.removeEventListener('pointerup', cancelHold)
        window.removeEventListener('pointermove', moveDuringHold)
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
      }
      holdTimerRef.current = setTimeout(() => {
        holdCleanupRef.current = null
        window.removeEventListener('pointerup', cancelHold)
        window.removeEventListener('pointermove', moveDuringHold)
        let dragging: PairGestureState = gestureRef.current
        flushSync(() => {
          dragging = applyGestureTransition({ type: 'HOLD_COMPLETE' })
        })
        if (dragging.phase === 'dragging') startDrag(groupId, startClientY)
      }, HOLD_MS)
    }
  }

  function startDrag(groupId: string, startClientY: number): void {
    const groupEls = [...(queueRef.current?.querySelectorAll<HTMLElement>('[data-group-id]') ?? [])]
    const fromIndex = pairGroups.findIndex((g) => groupIdOf(g) === groupId)
    const groupEl = groupEls[fromIndex]
    if (!groupEl || fromIndex === -1) return
    const rect = groupEl.getBoundingClientRect()
    dragStartRef.current = { top: rect.top, left: rect.left, width: rect.width, height: rect.height, clientY: startClientY }
    dragRectsRef.current = groupEls.map((el) => {
      const r = el.getBoundingClientRect()
      return { top: r.top, height: r.height }
    })
    dragFromIndexRef.current = fromIndex
    dragScrollStartRef.current = window.scrollY
    dragGroupIdRef.current = groupId
    dragOverIndexRef.current = fromIndex
    flushSync(() => {
      setDragGroupId(groupId)
      setDragOverIndex(fromIndex)
    })
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
  }

  function onDragMove(event: PointerEvent): void {
    const start = dragStartRef.current
    if (!start || !floatingRef.current || !dragGroupIdRef.current) return
    const delta = event.clientY - start.clientY
    floatingRef.current.style.transform = `translateY(${delta}px)`

    // Auto-scroll near the viewport edges — without this, a pair below the fold
    // (e.g. swapping pair 2 with pair 4/5 in a longer queue) is unreachable, since
    // this drag uses raw pointer tracking rather than native drag-and-drop, which
    // browsers auto-scroll for free.
    if (event.clientY < DRAG_SCROLL_EDGE_PX) {
      window.scrollBy({ top: -DRAG_SCROLL_STEP_PX })
    } else if (event.clientY > window.innerHeight - DRAG_SCROLL_EDGE_PX) {
      window.scrollBy({ top: DRAG_SCROLL_STEP_PX })
    }

    // siblingRects come from the one measurement pass taken at drag-start (dragRectsRef),
    // adjusted by however far the page has scrolled since — never re-queried live, so
    // applying a reflow transform to a sibling can't feed back into this calculation.
    const scrollDelta = window.scrollY - dragScrollStartRef.current
    const siblingRects = dragRectsRef.current
      .filter((_, i) => i !== dragFromIndexRef.current)
      .map((r) => ({ top: r.top - scrollDelta, height: r.height }))
    const newIndex = indexForPointerY(siblingRects, event.clientY)
    if (newIndex !== dragOverIndexRef.current) {
      dragOverIndexRef.current = newIndex
      flushSync(() => setDragOverIndex(newIndex))
    }
  }

  function clearDragState(): void {
    dragGroupIdRef.current = null
    dragStartRef.current = null
    dragRectsRef.current = []
    setDragGroupId(null)
  }

  function onDragEnd(): void {
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)

    const groupId = dragGroupIdRef.current
    const toIndex = dragOverIndexRef.current
    if (!groupId) return

    const { pairGroups: currentPairGroups, byId: currentById } = latestRef.current
    const fromIndex = currentPairGroups.findIndex((g) => groupIdOf(g) === groupId)
    const movedGroup = fromIndex === -1 ? undefined : currentPairGroups[fromIndex]

    if (fromIndex === -1 || fromIndex === toIndex || !movedGroup) {
      flushSync(() => clearDragState())
      return
    }

    // Dragging a pair by N slots always displaces exactly N other pairs by one slot
    // each — magnitude 1 is a genuine two-way swap (name both pairs); anything more
    // shifts several pairs, so the dialog states a count instead of misleadingly
    // naming only the pair at the exact drop slot (docs/superpowers/specs/2026-07-15-
    // pair-switch-confirm-design.md).
    const remaining = currentPairGroups.filter((_, i) => i !== fromIndex)
    const magnitude = Math.abs(toIndex - fromIndex)
    const occupantIndex = toIndex > fromIndex ? toIndex - 1 : toIndex
    const occupantGroup = magnitude === 1 ? remaining[occupantIndex] : undefined

    setPendingSwitch({
      groupId,
      toIndex,
      groupANames: namesOf(movedGroup, currentById),
      direction: toIndex < fromIndex ? 'up' : 'down',
      occupantNames: occupantGroup ? namesOf(occupantGroup, currentById) : null,
      shiftCount: magnitude,
    })
    // Drag refs/state are deliberately left as-is here (not cleared) — the floating
    // card and the live-reflow placeholder gap stay frozen at the drop target while
    // the confirmation dialog is open.
  }

  function handleConfirmSwitch(): void {
    const pending = pendingSwitch
    if (!pending) return
    const { pairGroups: currentPairGroups, orderIds: currentOrderIds, actions: currentActions, onError: currentOnError } = latestRef.current

    setPendingSwitch(null)
    clearDragState()

    const fromIndex = currentPairGroups.findIndex((g) => groupIdOf(g) === pending.groupId)
    if (fromIndex === -1) return
    const nextOrder = reorderGroups(currentPairGroups, fromIndex, pending.toIndex)
    const previousOrder = currentOrderIds
    setOrderIds(nextOrder)
    currentActions.reorderLine(nextOrder).catch(() => {
      setOrderIds(previousOrder)
      currentOnError?.(t('queue.actions.error'))
    })
  }

  function handleCancelSwitch(): void {
    setPendingSwitch(null)
    setDragOverIndex(dragFromIndexRef.current)
    if (floatingRef.current) {
      floatingRef.current.style.transition = `transform ${CANCEL_ANIMATION_MS}ms ease-out`
      floatingRef.current.style.transform = 'translateY(0px)'
    }
    cancelTimerRef.current = setTimeout(clearDragState, CANCEL_ANIMATION_MS)
  }

  const reflow = dragGroupId && dragRectsRef.current.length > 0 ? computeReflow(dragRectsRef.current, dragFromIndexRef.current, dragOverIndex) : null

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
          <div ref={queueRef} className="flex flex-col gap-4">
            {pairGroups.map((group, groupIndex) => {
              const isNext = group.pairIndex === 0 && group.hasPartner
              const variant: QueuePairGroupVariant = isNext ? 'next' : group.hasPartner ? 'default' : 'solo'
              const label = isNext
                ? t('queue.pair.next', { index: group.pairIndex + 1 })
                : group.hasPartner
                  ? t('queue.pair.label', { index: group.pairIndex + 1 })
                  : t('queue.pair.waiting')
              const groupId = groupIdOf(group)
              const gripState = gripVisual?.groupId === groupId ? gripVisual.phase : 'idle'

              if (groupId === dragGroupId && dragStartRef.current) {
                return (
                  <div
                    key={groupId}
                    data-group-id={groupId}
                    className="rounded-xl border-2 border-dashed border-accent-dim bg-accent-dim/5 transition-transform duration-150 ease-out"
                    style={{
                      height: dragStartRef.current.height,
                      transform: `translateY(${reflow?.placeholderOffset ?? 0}px)`,
                    }}
                  />
                )
              }

              return (
                <QueuePairGroup
                  key={groupId}
                  groupId={groupId}
                  label={label}
                  variant={variant}
                  gripState={gripState}
                  onGripPointerDown={(event) => handleGripPointerDown(groupId, event)}
                  {...(reflow
                    ? { style: { transform: `translateY(${reflow.siblingOffsets[groupIndex] ?? 0}px)`, transition: 'transform 150ms ease-out' } }
                    : {})}
                >
                  {group.entryIds.map((id, iInGroup) => {
                    const entry = byId.get(id)
                    if (!entry) return null
                    return (
                      <SortableQueueRow
                        key={entry.id}
                        entry={entry}
                        index={group.pairIndex * 2 + iInGroup}
                        isNext={isNext}
                        grouped
                        {...(group.pairIndex !== 0 ? { gamesAhead: group.gamesAhead, etaSec: group.etaSec } : {})}
                        {...(!group.hasPartner ? { etaApprox: true } : {})}
                        onMenu={() => setMenuEntryId(entry.id)}
                      />
                    )
                  })}
                </QueuePairGroup>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
      {dragGroupId && dragStartRef.current && (
        <div
          ref={floatingRef}
          className="pointer-events-none fixed z-30 scale-[1.02] rotate-[0.6deg]"
          style={{ top: dragStartRef.current.top, left: dragStartRef.current.left, width: dragStartRef.current.width }}
        >
          <div className="flex flex-col overflow-hidden rounded-xl border border-accent bg-surface shadow-xl shadow-black/70 [&>*+*]:border-t [&>*+*]:border-accent-dim">
            {pairGroups
              .find((g) => groupIdOf(g) === dragGroupId)
              ?.entryIds.map((id) => {
                const draggedEntry = byId.get(id)
                if (!draggedEntry) return null
                return (
                  <QueueRow
                    key={draggedEntry.id}
                    position={orderIds.indexOf(draggedEntry.id) + 1}
                    teamName={draggedEntry.team.name}
                    {...(draggedEntry.team.nickname ? { nickname: draggedEntry.team.nickname } : {})}
                    gamesToday={draggedEntry.team.gamesToday}
                    {...(draggedEntry.team.lastPlayedAt ? { lastPlayedAt: formatTimeOfDay(draggedEntry.team.lastPlayedAt) } : {})}
                    grouped
                    dragging
                  />
                )
              })}
          </div>
        </div>
      )}
      {pendingSwitch && (
        <PairSwitchConfirmDialog
          open
          onConfirm={handleConfirmSwitch}
          onCancel={handleCancelSwitch}
          groupANames={pendingSwitch.groupANames}
          direction={pendingSwitch.direction}
          occupantNames={pendingSwitch.occupantNames}
          shiftCount={pendingSwitch.shiftCount}
        />
      )}
      {menuEntry && <QueueActionsSheet open onClose={() => setMenuEntryId(null)} entry={menuEntry} {...(onError ? { onError } : {})} />}
    </>
  )
}

function SortableQueueRow({
  entry,
  index,
  isNext,
  grouped,
  gamesAhead,
  etaSec,
  etaApprox,
  onMenu,
}: {
  entry: QueueEntryView
  index: number
  isNext: boolean
  grouped?: boolean
  gamesAhead?: number
  etaSec?: number
  etaApprox?: boolean
  onMenu: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style}>
      <QueueRow
        position={index + 1}
        teamName={entry.team.name}
        {...(entry.team.nickname ? { nickname: entry.team.nickname } : {})}
        gamesToday={entry.team.gamesToday}
        {...(entry.team.lastPlayedAt ? { lastPlayedAt: formatTimeOfDay(entry.team.lastPlayedAt) } : {})}
        next={isNext}
        dragging={isDragging}
        {...(grouped ? { grouped } : {})}
        {...(gamesAhead !== undefined ? { gamesAhead } : {})}
        {...(etaSec !== undefined ? { etaSec } : {})}
        {...(etaApprox ? { etaApprox } : {})}
        onMenu={onMenu}
        handleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/components/QueueList.test.tsx`
Expected: PASS — every test in the file, including the 4 new/rewritten dragging tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/QueueList.tsx apps/web/src/components/QueueList.test.tsx apps/web/src/i18n/he.json
git commit -m "feat(web): confirm pair drag-and-drop before applying it"
```

---

### Task 3: Full verification and manual QA

**Files:** none (verification only).

- [ ] **Step 1: Run full typecheck and test suite**

```bash
pnpm typecheck
pnpm test
```

Expected: both succeed with no errors (strict tsc across all packages; full vitest run across `shared`/`web`/`api`).

- [ ] **Step 2: Manual verification against the dev server**

The freeze-then-dialog visual and the cancel snap-back animation aren't fully covered by jsdom unit tests (same precedent as the rest of this drag feature — see `docs/superpowers/specs/2026-07-13-queue-pair-move.md` Task 7). Run `pnpm dev`, open the app with an active session and at least 6 queue entries, and check:

- Dragging a pair one slot past its neighbor and releasing freezes the floating card and the open gap exactly at the drop target, then opens a dialog reading "להחליף בין [team/team] ⇄ [team/team]?".
- Dragging a pair across 2+ slots instead shows "להזיז את [team/team] למטה/למעלה? (עוד N זוגות יזוזו מקום)" with the correct count.
- Tapping אישור applies the reorder immediately with no further animation (the frozen preview already matched the result).
- Tapping ביטול (or tapping the dialog's overlay, or Escape) smoothly slides the card and the reflowed siblings back to their original positions over ~150ms, then the dialog and floating card are gone and the list matches the pre-drag order exactly.
- Dropping a pair back at its own original position (no net move) shows no dialog at all.
- `prefers-reduced-motion` doesn't break the gesture's timing or the eventual drop/cancel outcome (per the pre-existing pair-move design's requirement), even if the cancel slide itself is instant under that setting.

- [ ] **Step 3: Update the plan's status**

Mark all tasks above complete. No separate commit needed — this task only verifies work already committed in Tasks 1–2.

## Self-Review

**Spec coverage:** distance rule / adjacent-vs-multi wording (Task 2's `onDragEnd` magnitude/occupant computation + Task 1's title logic) — freeze-on-drop / no visual change on Confirm (Task 2's `onDragEnd` no longer clearing drag state, `handleConfirmSwitch` clearing it without re-animating) — Cancel snap-back animation (Task 2's `handleCancelSwitch` + `CANCEL_ANIMATION_MS`) — orphaned undo-toast removal (Task 2 Step 3, and the removed `showUndoToast` import/call) — every section of `docs/superpowers/specs/2026-07-15-pair-switch-confirm-design.md` has a task.

**Placeholder scan:** none — every step has complete, runnable code.

**Type consistency:** `PairSwitchConfirmDialogProps` (Task 1: `open`, `onConfirm`, `onCancel`, `groupANames`, `direction`, `occupantNames`, `shiftCount`) matches the JSX call site in Task 2's `QueueList.tsx` exactly. `PendingSwitch`'s fields (`groupId`, `toIndex`, `groupANames`, `direction`, `occupantNames`, `shiftCount`) match both where it's constructed in `onDragEnd` and where it's read in the JSX/`handleConfirmSwitch`. `namesOf`/`groupIdOf`/`clearDragState` are each defined once and reused across `onDragEnd`, `handleConfirmSwitch`, and the early-return branch without redefinition. `CANCEL_ANIMATION_MS` (150) matches the reflow's own hardcoded `150ms` CSS transition, called out explicitly in a comment so a future change to one prompts checking the other.
