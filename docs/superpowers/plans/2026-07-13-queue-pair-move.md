# Move a whole pair up/down in the queue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff move a whole predicted pair up or down in the queue via a double-tap-and-hold-then-drag gesture on a dedicated grip handle, with an undo toast after every move.

**Architecture:** A pure, timer-free gesture state machine (`idle → armed → holding → dragging`) drives a grip handle's visual state; `QueueList` owns all timers and DOM drag mechanics, using two more pure helpers (`indexForPointerY`, `reorderGroups`) to compute the drop target and the resulting flat entry order, then reuses the existing `reorderLine` action and `UndoToast` mechanism — no new API endpoint.

**Tech Stack:** React 19, TypeScript (strict), Tailwind v4, Vitest + Testing Library (jsdom), `sonner` (via existing `UndoToast.tsx`).

## Global Constraints

- TDD: write the failing test before the implementation for every task below (repo hard rule).
- TypeScript max-strict: no `any`, no non-null `!`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — optional props are omitted via conditional spread (`{...(cond ? { prop } : {})}`), never passed as literal `undefined`.
- i18n: zero hardcoded Hebrew strings in `.tsx` — every user-facing string goes through `apps/web/src/i18n/he.json` + `t()`.
- RTL: logical properties only; time/number runs are LTR-isolated with `<bdi>` + `tabular` (`font-variant-numeric: tabular-nums`).
- Tokens: components use semantic Tailwind utilities (`bg-surface`, `text-accent`, `border-line`, `bg-warn`, …) — never a raw hex value.
- Design spec: `docs/superpowers/specs/2026-07-13-queue-pair-move-design.md` — read it if any task instruction below is ambiguous.
- Test commands are run from the repo root: `pnpm --filter web vitest run <path>` for a single file, `pnpm typecheck` and `pnpm test` before considering the whole plan done.
- Testing scope note: this codebase does not unit-test the pixel geometry of the *existing* per-row dnd-kit drag either (`QueueList.test.tsx` has no test simulating a dnd-kit drag) — real drag-and-drop pixel behavior is verified manually against the dev server, not in jsdom. This plan follows the same precedent: the gesture *state machine* and the *drop-index math* are pure and fully TDD'd; the DOM wiring around them is implemented per the design and given one geometry-mocked integration test per outcome, with final confidence coming from Task 7's manual verification.

---

### Task 1: Pure gesture state machine

**Files:**
- Create: `apps/web/src/lib/pair-drag-gesture.ts`
- Test: `apps/web/src/lib/pair-drag-gesture.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no imports beyond TypeScript itself).
- Produces: `DOUBLE_TAP_WINDOW_MS: number`, `HOLD_MS: number`, `PairGestureState` (discriminated union on `phase`), `PairGestureEvent` (discriminated union on `type`), `pairGestureReducer(state: PairGestureState, event: PairGestureEvent): PairGestureState`. Task 2 adds more exports to this same file; Task 5 imports all of these from `@/lib/pair-drag-gesture`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/pair-drag-gesture.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { pairGestureReducer, type PairGestureState } from './pair-drag-gesture'

const idle: PairGestureState = { phase: 'idle' }

describe('pairGestureReducer', () => {
  it('arms on the first grip tap', () => {
    expect(pairGestureReducer(idle, { type: 'GRIP_DOWN', groupId: 'g1' })).toEqual({ phase: 'armed', groupId: 'g1' })
  })

  it('moves to holding on a second tap of the same grip while armed', () => {
    const armed: PairGestureState = { phase: 'armed', groupId: 'g1' }
    expect(pairGestureReducer(armed, { type: 'GRIP_DOWN', groupId: 'g1' })).toEqual({ phase: 'holding', groupId: 'g1' })
  })

  it('restarts armed on a different grip while armed for another', () => {
    const armed: PairGestureState = { phase: 'armed', groupId: 'g1' }
    expect(pairGestureReducer(armed, { type: 'GRIP_DOWN', groupId: 'g2' })).toEqual({ phase: 'armed', groupId: 'g2' })
  })

  it('drops back to idle when the double-tap window elapses while armed', () => {
    const armed: PairGestureState = { phase: 'armed', groupId: 'g1' }
    expect(pairGestureReducer(armed, { type: 'DOUBLE_TAP_TIMEOUT' })).toEqual({ phase: 'idle' })
  })

  it('ignores a stray double-tap timeout once already holding', () => {
    const holding: PairGestureState = { phase: 'holding', groupId: 'g1' }
    expect(pairGestureReducer(holding, { type: 'DOUBLE_TAP_TIMEOUT' })).toEqual(holding)
  })

  it('starts dragging when the hold completes', () => {
    const holding: PairGestureState = { phase: 'holding', groupId: 'g1' }
    expect(pairGestureReducer(holding, { type: 'HOLD_COMPLETE' })).toEqual({ phase: 'dragging', groupId: 'g1' })
  })

  it('ignores a stray hold-complete outside holding', () => {
    expect(pairGestureReducer(idle, { type: 'HOLD_COMPLETE' })).toEqual(idle)
  })

  it('cancels from any phase back to idle', () => {
    expect(pairGestureReducer({ phase: 'armed', groupId: 'g1' }, { type: 'CANCEL' })).toEqual({ phase: 'idle' })
    expect(pairGestureReducer({ phase: 'holding', groupId: 'g1' }, { type: 'CANCEL' })).toEqual({ phase: 'idle' })
    expect(pairGestureReducer({ phase: 'dragging', groupId: 'g1' }, { type: 'CANCEL' })).toEqual({ phase: 'idle' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/lib/pair-drag-gesture.test.ts`
Expected: FAIL — `Cannot find module './pair-drag-gesture'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/lib/pair-drag-gesture.ts`:

```ts
/**
 * Pure state machine for the "double-tap-and-hold to drag a pair" gesture
 * (docs/superpowers/specs/2026-07-13-queue-pair-move-design.md). Callers own
 * all timers (setTimeout for the double-tap window and the hold duration)
 * and dispatch events into this reducer — kept timer-free so transitions
 * are unit-testable without simulating real time or pointer geometry.
 */

export const DOUBLE_TAP_WINDOW_MS = 350
export const HOLD_MS = 380

export type PairGestureState =
  | { phase: 'idle' }
  | { phase: 'armed'; groupId: string }
  | { phase: 'holding'; groupId: string }
  | { phase: 'dragging'; groupId: string }

export type PairGestureEvent =
  | { type: 'GRIP_DOWN'; groupId: string }
  | { type: 'DOUBLE_TAP_TIMEOUT' }
  | { type: 'HOLD_COMPLETE' }
  | { type: 'CANCEL' }

export function pairGestureReducer(state: PairGestureState, event: PairGestureEvent): PairGestureState {
  switch (event.type) {
    case 'GRIP_DOWN':
      if (state.phase === 'armed' && state.groupId === event.groupId) {
        return { phase: 'holding', groupId: event.groupId }
      }
      return { phase: 'armed', groupId: event.groupId }
    case 'DOUBLE_TAP_TIMEOUT':
      return state.phase === 'armed' ? { phase: 'idle' } : state
    case 'HOLD_COMPLETE':
      return state.phase === 'holding' ? { phase: 'dragging', groupId: state.groupId } : state
    case 'CANCEL':
      return { phase: 'idle' }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/lib/pair-drag-gesture.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/pair-drag-gesture.ts apps/web/src/lib/pair-drag-gesture.test.ts
git commit -m "feat(web): add pure pair-drag gesture state machine"
```

---

### Task 2: Pure drop-index helper

**Files:**
- Modify: `apps/web/src/lib/pair-drag-gesture.ts`
- Modify: `apps/web/src/lib/pair-drag-gesture.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 directly (independent pure function in the same file).
- Produces: `RectLike` (`{ top: number; height: number }`), `indexForPointerY(rects: RectLike[], pointerY: number): number`. Task 6 imports this from `@/lib/pair-drag-gesture`.

- [ ] **Step 1: Write the failing test**

Add to the end of `apps/web/src/lib/pair-drag-gesture.test.ts`:

```ts
import { indexForPointerY } from './pair-drag-gesture'

describe('indexForPointerY', () => {
  const rects = [
    { top: 0, height: 100 },
    { top: 100, height: 100 },
    { top: 200, height: 100 },
  ]

  it('returns 0 when the pointer is above the first midpoint', () => {
    expect(indexForPointerY(rects, 10)).toBe(0)
  })

  it('returns the middle index when the pointer is past the first midpoint but before the second', () => {
    expect(indexForPointerY(rects, 120)).toBe(1)
  })

  it('returns the list length when the pointer is past every midpoint', () => {
    expect(indexForPointerY(rects, 999)).toBe(3)
  })

  it('returns 0 for an empty list', () => {
    expect(indexForPointerY([], 50)).toBe(0)
  })
})
```

(Add the `indexForPointerY` import to the existing top-of-file import line rather than a second `import` statement — the file already imports `pairGestureReducer` and `PairGestureState` from `./pair-drag-gesture`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/lib/pair-drag-gesture.test.ts`
Expected: FAIL — `indexForPointerY` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to the end of `apps/web/src/lib/pair-drag-gesture.ts`:

```ts
export interface RectLike {
  top: number
  height: number
}

/**
 * Given the vertical rects of the groups NOT being dragged (in current visual
 * order), returns the index the dragged group should land at for a given
 * pointer Y position — the pointer crossing a rect's vertical midpoint is
 * what flips the target index, matching the approved mockup's behavior.
 */
export function indexForPointerY(rects: RectLike[], pointerY: number): number {
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]
    if (rect && pointerY < rect.top + rect.height / 2) return i
  }
  return rects.length
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/lib/pair-drag-gesture.test.ts`
Expected: PASS (12 tests total).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/pair-drag-gesture.ts apps/web/src/lib/pair-drag-gesture.test.ts
git commit -m "feat(web): add pure drop-index helper for pair drag"
```

---

### Task 3: Pure reorder helper

**Files:**
- Modify: `apps/web/src/lib/queue-pairing.ts`
- Modify: `apps/web/src/lib/queue-pairing.test.ts`

**Interfaces:**
- Consumes: `PairGroup` (already defined in this file).
- Produces: `reorderGroups(groups: PairGroup[], fromIndex: number, toIndex: number): string[]`. Task 6 imports this from `@/lib/queue-pairing`.

- [ ] **Step 1: Write the failing test**

Add to the end of `apps/web/src/lib/queue-pairing.test.ts` (add `reorderGroups` to the existing top import line):

```ts
describe('reorderGroups', () => {
  it('moves a pair from a later index to the front', () => {
    const groups = buildPairGroups(['a', 'b', 'c', 'd', 'e', 'f'], 0, 480)
    expect(reorderGroups(groups, 2, 0)).toEqual(['e', 'f', 'a', 'b', 'c', 'd'])
  })

  it('moves a pair from the front to a later index', () => {
    const groups = buildPairGroups(['a', 'b', 'c', 'd', 'e', 'f'], 0, 480)
    expect(reorderGroups(groups, 0, 2)).toEqual(['c', 'd', 'e', 'f', 'a', 'b'])
  })

  it('moves a pair down past a trailing solo entry', () => {
    const groups = buildPairGroups(['a', 'b', 'c', 'd', 'e'], 0, 480)
    expect(reorderGroups(groups, 1, 2)).toEqual(['a', 'b', 'e', 'c', 'd'])
  })

  it('is a no-op when fromIndex and toIndex are the same', () => {
    const groups = buildPairGroups(['a', 'b', 'c', 'd'], 0, 480)
    expect(reorderGroups(groups, 1, 1)).toEqual(['a', 'b', 'c', 'd'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/lib/queue-pairing.test.ts`
Expected: FAIL — `reorderGroups` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to the end of `apps/web/src/lib/queue-pairing.ts`:

```ts
/**
 * Moves the group at fromIndex to toIndex within the pair-group list, then
 * flattens the result back into a flat queue order — the reorderLine payload
 * after a pair-level drag-and-drop (docs/superpowers/specs/2026-07-13-queue-
 * pair-move-design.md).
 */
export function reorderGroups(groups: PairGroup[], fromIndex: number, toIndex: number): string[] {
  const reordered = [...groups]
  const [moved] = reordered.splice(fromIndex, 1)
  if (moved) reordered.splice(toIndex, 0, moved)
  return reordered.flatMap((g) => g.entryIds)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/lib/queue-pairing.test.ts`
Expected: PASS (12 tests total).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/queue-pairing.ts apps/web/src/lib/queue-pairing.test.ts
git commit -m "feat(web): add pure pair-group reorder helper"
```

---

### Task 4: `QueuePairGroup` grip handle

**Files:**
- Modify: `apps/web/src/components/QueuePairGroup.tsx`
- Modify: `apps/web/src/components/QueuePairGroup.test.tsx`
- Modify: `apps/web/src/i18n/he.json:38` (insert after `"queue.pair.etaApprox"`)

**Interfaces:**
- Consumes: nothing from Tasks 1–3 directly (grip state is a plain string union defined in this component).
- Produces: `PairGripState = 'idle' | 'armed' | 'holding'`, `QueuePairGroupProps` gains `groupId?: string`, `gripState?: PairGripState`, `onGripPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void`. Task 5 imports `PairGripState` and passes all three new props from `@/components/QueuePairGroup`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/src/components/QueuePairGroup.test.tsx` (add `fireEvent` and `vi` to the existing top imports):

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
```

Then add these tests inside the existing `describe('QueuePairGroup', ...)` block, before the final closing `})`:

```tsx
  it('renders a grip handle for a pair variant but not for solo', () => {
    const { rerender, container } = render(
      <QueuePairGroup label="זוג 2" variant="default">
        <div>Row</div>
      </QueuePairGroup>,
    )
    expect(screen.getByRole('button', { name: 'הזז את זוג 2 — הקישו פעמיים והחזיקו כדי לגרור' })).toBeDefined()

    rerender(
      <QueuePairGroup label="ממתין/ה לזוג" variant="solo">
        <div>Row</div>
      </QueuePairGroup>,
    )
    expect(container.querySelector('button')).toBeNull()
  })

  it('calls onGripPointerDown when the grip receives a pointerdown', () => {
    const onGripPointerDown = vi.fn()
    render(
      <QueuePairGroup label="זוג 2" variant="default" onGripPointerDown={onGripPointerDown}>
        <div>Row</div>
      </QueuePairGroup>,
    )
    fireEvent.pointerDown(screen.getByRole('button', { name: /זוג 2/ }))
    expect(onGripPointerDown).toHaveBeenCalledTimes(1)
  })

  it('shows the armed state on the grip', () => {
    render(
      <QueuePairGroup label="זוג 2" variant="default" gripState="armed">
        <div>Row</div>
      </QueuePairGroup>,
    )
    expect(screen.getByRole('button', { name: /זוג 2/ }).className).toContain('bg-warn')
  })

  it('shows the holding state on the grip', () => {
    render(
      <QueuePairGroup label="זוג 2" variant="default" gripState="holding">
        <div>Row</div>
      </QueuePairGroup>,
    )
    expect(screen.getByRole('button', { name: /זוג 2/ }).className).toContain('bg-accent-dim')
  })

  it('sets the data-group-id attribute when groupId is provided', () => {
    const { container } = render(
      <QueuePairGroup label="זוג 2" variant="default" groupId="e3">
        <div>Row</div>
      </QueuePairGroup>,
    )
    expect(container.querySelector('[data-group-id="e3"]')).not.toBeNull()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/components/QueuePairGroup.test.tsx`
Expected: FAIL — no grip button is rendered yet, `groupId`/`gripState`/`onGripPointerDown` don't exist on `QueuePairGroupProps` (TS error).

- [ ] **Step 3: Write minimal implementation**

Add this key to `apps/web/src/i18n/he.json` immediately after line 38 (`"queue.pair.etaApprox": "(משוער)",`), before `"quickAdd.searchPlaceholder"`:

```json
  "queue.pair.gripLabel": "הזז את {label} — הקישו פעמיים והחזיקו כדי לגרור",
```

Replace the full contents of `apps/web/src/components/QueuePairGroup.tsx` with:

```tsx
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { t } from '@/i18n'
import { cn } from '@/lib/cn'

/**
 * Single responsibility: visually groups the 1-2 QueueRows of one predicted
 * pair inside a single shared card — the shape carries the "these two play
 * each other" meaning, not color or text alone (see
 * docs/superpowers/specs/2026-07-13-queue-pairing-and-eta-design.md, which
 * documents why an earlier text-only version was rejected). The label sits
 * in normal flow above the card, never absolutely positioned over its
 * border, so it can never be clipped by the card's rounded corners.
 *
 * Pair (non-solo) variants also render a grip handle used by the
 * double-tap-and-hold-to-drag gesture that moves the whole pair
 * (docs/superpowers/specs/2026-07-13-queue-pair-move-design.md) — the
 * gesture's timers and DOM drag mechanics live in QueueList; this component
 * only renders the handle, reports pointerdown, and reflects gripState.
 */
export type QueuePairGroupVariant = 'next' | 'default' | 'solo'
export type PairGripState = 'idle' | 'armed' | 'holding'

export interface QueuePairGroupProps {
  label: string
  variant: QueuePairGroupVariant
  children: ReactNode
  /** DOM identity used by QueueList's imperative drag code (getBoundingClientRect lookups). */
  groupId?: string
  gripState?: PairGripState
  onGripPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void
}

export function QueuePairGroup({
  label,
  variant,
  children,
  groupId,
  gripState = 'idle',
  onGripPointerDown,
}: QueuePairGroupProps) {
  return (
    <div className="flex flex-col gap-1.5" data-group-id={groupId}>
      <div className="flex items-center gap-1">
        {variant !== 'solo' && (
          <button
            type="button"
            onPointerDown={onGripPointerDown}
            aria-label={t('queue.pair.gripLabel', { label })}
            className={cn(
              'flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] touch-none items-center justify-center rounded-lg',
              gripState === 'armed' && 'bg-warn/10',
              gripState === 'holding' && 'bg-accent-dim/20',
            )}
          >
            <span className="grid grid-cols-2 grid-rows-3 gap-[3px]" aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-[3px] w-[3px] rounded-full bg-muted',
                    gripState === 'armed' && 'bg-warn',
                    gripState === 'holding' && 'bg-accent',
                  )}
                />
              ))}
            </span>
          </button>
        )}
        <span className={cn('px-1 text-[12px] font-semibold text-muted', variant === 'next' && 'text-accent')}>
          {label}
        </span>
      </div>
      <div
        className={cn(
          'flex flex-col rounded-xl border border-line bg-surface [&>*+*]:border-t [&>*+*]:border-line',
          variant === 'next' && 'border-accent [&>*+*]:border-accent-dim',
          variant === 'solo' && 'border-dashed',
        )}
      >
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/components/QueuePairGroup.test.tsx`
Expected: PASS (all previous tests plus the 5 new ones).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/QueuePairGroup.tsx apps/web/src/components/QueuePairGroup.test.tsx apps/web/src/i18n/he.json
git commit -m "feat(web): add pair-level grip handle to QueuePairGroup"
```

---

### Task 5: `QueueList` — grip arming/holding wiring

**Files:**
- Modify: `apps/web/src/components/QueueList.tsx`
- Modify: `apps/web/src/components/QueueList.test.tsx`

**Interfaces:**
- Consumes: `pairGestureReducer`, `DOUBLE_TAP_WINDOW_MS`, `HOLD_MS`, `PairGestureState` (Task 1) from `@/lib/pair-drag-gesture`; `groupId`/`gripState`/`onGripPointerDown` props (Task 4) on `QueuePairGroup`.
- Produces: a `groupIdOf(group)` module-level helper (`(group: { pairIndex: number; entryIds: string[] }) => string`) that Task 6 reuses.

This task wires taps into the gesture reducer and reflects `armed`/`holding` on the grip. Reaching `dragging` is a no-op for now (Task 6 adds the actual drag) — the grip visual simply clears, which is what these tests verify.

- [ ] **Step 1: Write the failing tests**

Add `vi` to the existing `import { describe, expect, it, vi } from 'vitest'` line in `apps/web/src/components/QueueList.test.tsx` (already imports `vi`) and add a new `describe` block at the end of the file, before the final closing `})` of the outer `describe('QueueList', ...)`:

```tsx
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
  })
```

Also add `beforeEach, afterEach` to the vitest import line at the top of the file:

```tsx
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/components/QueueList.test.tsx`
Expected: FAIL — no grip button exists yet (queries return nothing / TS errors on missing props flow).

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `apps/web/src/components/QueueList.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { QueueEntryView } from 'shared'
import { QueuePairGroup, type QueuePairGroupVariant } from '@/components/QueuePairGroup'
import { QueueRow } from '@/components/QueueRow'
import { QueueActionsSheet } from '@/components/QueueActionsSheet'
import { t } from '@/i18n'
import { pairGestureReducer, DOUBLE_TAP_WINDOW_MS, HOLD_MS, type PairGestureState } from '@/lib/pair-drag-gesture'
import { buildPairGroups } from '@/lib/queue-pairing'
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
 * (docs/superpowers/specs/2026-07-13-queue-pair-move-design.md). This owns
 * the gesture's timers; the DOM drag mechanics are added in a later change.
 */
export interface QueueListProps {
  queue: QueueEntryView[]
  matchDurationSec: number
  baseSec: number
  onError?: (message: string) => void
}

function groupIdOf(group: { pairIndex: number; entryIds: string[] }): string {
  return group.entryIds[0] ?? `pair-${group.pairIndex}`
}

export function QueueList({ queue, matchDurationSec, baseSec, onError }: QueueListProps) {
  const actions = useSessionActions()
  const [orderIds, setOrderIds] = useState<string[]>(() => queue.map((e) => e.id))
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null)

  const gestureRef = useRef<PairGestureState>({ phase: 'idle' })
  const [gripVisual, setGripVisual] = useState<{ groupId: string; phase: 'armed' | 'holding' } | null>(null)
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setOrderIds(queue.map((e) => e.id))
  }, [queue])

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
    const next = applyGestureTransition({ type: 'GRIP_DOWN', groupId })

    if (next.phase === 'armed') {
      doubleTapTimerRef.current = setTimeout(() => applyGestureTransition({ type: 'DOUBLE_TAP_TIMEOUT' }), DOUBLE_TAP_WINDOW_MS)
      return
    }

    if (next.phase === 'holding') {
      const startClientY = event.clientY
      const cancelHold = (): void => {
        window.removeEventListener('pointerup', cancelHold)
        window.removeEventListener('pointermove', moveDuringHold)
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
        applyGestureTransition({ type: 'CANCEL' })
      }
      const moveDuringHold = (moveEvent: PointerEvent): void => {
        if (Math.abs(moveEvent.clientY - startClientY) > 8) cancelHold()
      }
      window.addEventListener('pointerup', cancelHold)
      window.addEventListener('pointermove', moveDuringHold)
      holdTimerRef.current = setTimeout(() => {
        window.removeEventListener('pointerup', cancelHold)
        window.removeEventListener('pointermove', moveDuringHold)
        applyGestureTransition({ type: 'HOLD_COMPLETE' })
      }, HOLD_MS)
    }
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-4">
            {pairGroups.map((group) => {
              const isNext = group.pairIndex === 0 && group.hasPartner
              const variant: QueuePairGroupVariant = isNext ? 'next' : group.hasPartner ? 'default' : 'solo'
              const label = isNext
                ? t('queue.pair.next', { index: group.pairIndex + 1 })
                : group.hasPartner
                  ? t('queue.pair.label', { index: group.pairIndex + 1 })
                  : t('queue.pair.waiting')
              const groupId = groupIdOf(group)
              const gripState = gripVisual?.groupId === groupId ? gripVisual.phase : 'idle'
              return (
                <QueuePairGroup
                  key={groupId}
                  groupId={groupId}
                  label={label}
                  variant={variant}
                  gripState={gripState}
                  onGripPointerDown={(event) => handleGripPointerDown(groupId, event)}
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/components/QueueList.test.tsx`
Expected: PASS (all previous tests plus the 5 new ones).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/QueueList.tsx apps/web/src/components/QueueList.test.tsx
git commit -m "feat(web): wire pair grip double-tap-and-hold arming in QueueList"
```

---

### Task 6: `QueueList` — drag mechanics, drop, and undo toast

**Files:**
- Modify: `apps/web/src/components/QueueList.tsx`
- Modify: `apps/web/src/components/QueueList.test.tsx`
- Modify: `apps/web/src/components/UndoToast.tsx`
- Modify: `apps/web/src/i18n/he.json:63` (insert after `"toast.matchFinished"`)

**Interfaces:**
- Consumes: `indexForPointerY` (Task 2) from `@/lib/pair-drag-gesture`; `reorderGroups` (Task 3) from `@/lib/queue-pairing`; `groupIdOf` (Task 5, already in this file).
- Produces: `showUndoToast` gains an optional `params?: Record<string, string | number>` argument (backward compatible — existing callers unaffected).

Scope decision, documented in the design spec: the dragged group's original slot shows a dashed placeholder for the duration of the drag rather than live-reflowing the other cards' positions — the final drop target is still computed continuously from the pointer position via `indexForPointerY`, but the *other* cards don't visually shift until drop. Full live-reflow is a possible follow-up, not required here.

- [ ] **Step 1: Write the failing tests**

Add `beforeEach`/`afterEach` are already imported from Task 5. Update the `renderQueueList` helper near the top of `apps/web/src/components/QueueList.test.tsx` to also return `container`:

```tsx
function renderQueueList(queue: QueueEntryView[], opts: { matchDurationSec?: number; baseSec?: number } = {}) {
  const actions: SessionActions = {
    addToLine: vi.fn(),
    searchTeams: vi.fn().mockResolvedValue([]),
    reorderLine: vi.fn().mockResolvedValue(undefined),
    moveTop: vi.fn(),
    moveBottom: vi.fn(),
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
  return { actions, container: result.container }
}
```

Add a `mockRect` helper and a new `describe` block at the end of the file, before the final closing `})`:

```tsx
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

  it('drags the front pair past the middle pair and reorders on drop', () => {
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

    expect(actions.reorderLine).toHaveBeenCalledWith(['e3', 'e4', 'e1', 'e2', 'e5', 'e6'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/components/QueueList.test.tsx`
Expected: FAIL — dragging is currently a no-op, so `reorderLine` is never called in the third test; TS errors on the missing `container` return may also surface until Step 3 lands.

- [ ] **Step 3: Write minimal implementation**

First, in `apps/web/src/components/UndoToast.tsx`, change `showUndoToast` to accept optional interpolation params (backward compatible — no existing call site passes a third argument today):

```ts
export function showUndoToast(
  messageKey: MessageKey,
  onUndo: () => void,
  params?: Record<string, string | number>,
  durationMs: number = UNDO_WINDOW_MS,
): void {
  toast(t(messageKey, params), {
    duration: durationMs,
    action: { label: t('action.undo'), onClick: onUndo },
  })
}
```

Add these two keys to `apps/web/src/i18n/he.json` immediately after line 63 (`"toast.removedFromQueue": "הקבוצה הוסרה מהתור",`), before `"toast.matchFinished"`:

```json
  "toast.pairMovedUp": "{names} הוזז/ה למעלה",
  "toast.pairMovedDown": "{names} הוזז/ה למטה",
```

Replace the full contents of `apps/web/src/components/QueueList.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { QueueEntryView } from 'shared'
import { QueuePairGroup, type QueuePairGroupVariant } from '@/components/QueuePairGroup'
import { QueueRow } from '@/components/QueueRow'
import { QueueActionsSheet } from '@/components/QueueActionsSheet'
import { showUndoToast } from '@/components/UndoToast'
import { t } from '@/i18n'
import { pairGestureReducer, DOUBLE_TAP_WINDOW_MS, HOLD_MS, indexForPointerY, type PairGestureState } from '@/lib/pair-drag-gesture'
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
 * (docs/superpowers/specs/2026-07-13-queue-pair-move-design.md). The
 * dragged group's original slot shows a placeholder for the drag's
 * duration; the other cards don't live-reflow, only the final drop reorders
 * the list — a deliberate scope simplification noted in the design spec.
 */
export interface QueueListProps {
  queue: QueueEntryView[]
  matchDurationSec: number
  baseSec: number
  onError?: (message: string) => void
}

function groupIdOf(group: { pairIndex: number; entryIds: string[] }): string {
  return group.entryIds[0] ?? `pair-${group.pairIndex}`
}

export function QueueList({ queue, matchDurationSec, baseSec, onError }: QueueListProps) {
  const actions = useSessionActions()
  const [orderIds, setOrderIds] = useState<string[]>(() => queue.map((e) => e.id))
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null)

  const gestureRef = useRef<PairGestureState>({ phase: 'idle' })
  const [gripVisual, setGripVisual] = useState<{ groupId: string; phase: 'armed' | 'holding' } | null>(null)
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const queueRef = useRef<HTMLDivElement>(null)
  const floatingRef = useRef<HTMLDivElement>(null)
  const [dragGroupId, setDragGroupId] = useState<string | null>(null)
  const dragGroupIdRef = useRef<string | null>(null)
  const dragOverIndexRef = useRef(0)
  const dragStartRef = useRef<{ top: number; left: number; width: number; height: number; clientY: number } | null>(null)

  useEffect(() => {
    setOrderIds(queue.map((e) => e.id))
  }, [queue])

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
    const next = applyGestureTransition({ type: 'GRIP_DOWN', groupId })

    if (next.phase === 'armed') {
      doubleTapTimerRef.current = setTimeout(() => applyGestureTransition({ type: 'DOUBLE_TAP_TIMEOUT' }), DOUBLE_TAP_WINDOW_MS)
      return
    }

    if (next.phase === 'holding') {
      const startClientY = event.clientY
      const cancelHold = (): void => {
        window.removeEventListener('pointerup', cancelHold)
        window.removeEventListener('pointermove', moveDuringHold)
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
        applyGestureTransition({ type: 'CANCEL' })
      }
      const moveDuringHold = (moveEvent: PointerEvent): void => {
        if (Math.abs(moveEvent.clientY - startClientY) > 8) cancelHold()
      }
      window.addEventListener('pointerup', cancelHold)
      window.addEventListener('pointermove', moveDuringHold)
      holdTimerRef.current = setTimeout(() => {
        window.removeEventListener('pointerup', cancelHold)
        window.removeEventListener('pointermove', moveDuringHold)
        const dragging = applyGestureTransition({ type: 'HOLD_COMPLETE' })
        if (dragging.phase === 'dragging') startDrag(groupId, startClientY)
      }, HOLD_MS)
    }
  }

  function startDrag(groupId: string, startClientY: number): void {
    const groupEl = queueRef.current?.querySelector<HTMLElement>(`[data-group-id="${groupId}"]`)
    const fromIndex = pairGroups.findIndex((g) => groupIdOf(g) === groupId)
    if (!groupEl || fromIndex === -1) return
    const rect = groupEl.getBoundingClientRect()
    dragStartRef.current = { top: rect.top, left: rect.left, width: rect.width, height: rect.height, clientY: startClientY }
    dragGroupIdRef.current = groupId
    dragOverIndexRef.current = fromIndex
    setDragGroupId(groupId)
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
  }

  function onDragMove(event: PointerEvent): void {
    const start = dragStartRef.current
    if (!start || !floatingRef.current || !queueRef.current || !dragGroupIdRef.current) return
    const delta = event.clientY - start.clientY
    floatingRef.current.style.transform = `translateY(${delta}px)`

    const siblingRects = [...queueRef.current.querySelectorAll<HTMLElement>('[data-group-id]')]
      .filter((el) => el.dataset.groupId !== dragGroupIdRef.current)
      .map((el) => el.getBoundingClientRect())
    dragOverIndexRef.current = indexForPointerY(siblingRects, event.clientY)
  }

  function onDragEnd(): void {
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)

    const groupId = dragGroupIdRef.current
    const toIndex = dragOverIndexRef.current
    dragGroupIdRef.current = null
    dragStartRef.current = null
    setDragGroupId(null)
    if (!groupId) return

    const fromIndex = pairGroups.findIndex((g) => groupIdOf(g) === groupId)
    if (fromIndex === -1 || fromIndex === toIndex) return
    const movedGroup = pairGroups[fromIndex]
    if (!movedGroup) return

    const nextOrder = reorderGroups(pairGroups, fromIndex, toIndex)
    const previousOrder = orderIds
    setOrderIds(nextOrder)
    actions.reorderLine(nextOrder).catch(() => {
      setOrderIds(previousOrder)
      onError?.(t('queue.actions.error'))
    })

    const names = movedGroup.entryIds
      .map((id) => byId.get(id)?.team.name)
      .filter((name): name is string => Boolean(name))
      .join(' / ')
    const messageKey = toIndex < fromIndex ? 'toast.pairMovedUp' : 'toast.pairMovedDown'
    showUndoToast(
      messageKey,
      () => {
        setOrderIds(previousOrder)
        actions.reorderLine(previousOrder).catch(() => {
          onError?.(t('queue.actions.error'))
        })
      },
      { names },
    )
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
          <div ref={queueRef} className="flex flex-col gap-4">
            {pairGroups.map((group) => {
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
                    className="rounded-xl border-2 border-dashed border-accent-dim bg-accent-dim/5"
                    style={{ height: dragStartRef.current.height }}
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/components/QueueList.test.tsx`
Expected: PASS (all previous tests plus the 3 new ones in `pair drag gesture — dragging`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/QueueList.tsx apps/web/src/components/QueueList.test.tsx apps/web/src/components/UndoToast.tsx apps/web/src/i18n/he.json
git commit -m "feat(web): implement pair drag-and-drop with undo toast"
```

---

### Task 7: Full verification and manual QA

**Files:** none (verification only).

- [ ] **Step 1: Run full typecheck and test suite**

```bash
pnpm typecheck
pnpm test
```

Expected: both succeed with no errors (strict tsc across all packages; full vitest run across `shared`/`web`/`api`).

- [ ] **Step 2: Manual verification against the dev server**

The gesture's real pointer-geometry behavior (live drag tracking, drop-target feel) is not fully covered by jsdom unit tests — same precedent as the existing per-row dnd-kit drag. Run `pnpm dev`, open the app with an active session and at least 5 queue entries, and check:

- Single tap on a grip does nothing; a tap that isn't followed by a second tap within ~350ms resets (amber pulse disappears).
- Second tap-and-hold for ~380ms lifts the card (scale + shadow) and it follows the pointer/finger.
- Dragging past another pair and releasing reorders the queue; the front pair gets the "הבא" badge correctly after the reorder.
- The front pair's grip can drag it down; dragging another pair up into position 0 correctly promotes it to "הבא".
- The trailing solo entry (odd-length queue) has no grip handle, only its existing row `≡` handle.
- After a move, the undo toast appears bottom-center for ~5s with a "בטל" button; tapping it reverts the order.
- `prefers-reduced-motion` (enable via OS/browser dev tools) removes the pulse/fill/lift animations without breaking the gesture's timing or the drop.

- [ ] **Step 3: Update the plan's status**

Mark all tasks above complete. No separate commit needed — this task only verifies work already committed in Tasks 1–6.

## Self-Review

**Spec coverage:** double-tap-and-hold state machine (Task 1), drop-index math (Task 2), pair-array reorder (Task 3), grip handle + solo exclusion (Task 4), armed/holding wiring (Task 5), drag mechanics + front-pair-needs-no-special-case behavior (falls out naturally from `indexForPointerY`/`reorderGroups` — no special-casing code exists for pairIndex 0, matching the spec's explicit claim) + undo toast (Task 6), manual verification of the touch/pointer-only limitation and reduced-motion (Task 7) — every section of `docs/superpowers/specs/2026-07-13-queue-pair-move-design.md` has a task.

**Placeholder scan:** none — every step has complete, runnable code.

**Type consistency:** `PairGestureState`/`PairGestureEvent` field names (`phase`, `groupId`, `type`) match between Task 1's definition and Task 5/6's usage. `RectLike` (`top`, `height`) matches between Task 2's definition and Task 6's `siblingRects` mapping. `groupIdOf` is defined once in Task 5 and reused unchanged in Task 6. `QueuePairGroupProps`' new fields (`groupId`, `gripState`, `onGripPointerDown`) match between Task 4's definition and Task 5/6's call sites. `showUndoToast`'s new `params` argument matches between Task 6's `UndoToast.tsx` change and its own call site.
