# Always name a specific swap partner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the count-based multi-slot wording in all three reorder-confirmation dialogs (pair-grip drag, per-row drag, move-to-top/bottom) with a single universal rule: always name the moved entity and whichever entity lands in its exact original slot, for any move distance.

**Architecture:** `planRowSwitch` and the pair-drag's inline occupant math both switch from "name an occupant only for a 1-slot move, else a count" to "the occupant is always `array[fromIndex + 1]` (moving down) or `array[fromIndex - 1]` (moving up), regardless of distance" — a simplification, not just new logic, since it removes a whole branch and a filtered-array construction. `PairSwitchConfirmDialog` shrinks to match: `unit`, `shiftCount`, and `direction` are removed from its props, and `occupantNames` becomes a required (non-nullable) field.

**Tech Stack:** React 19, TypeScript (strict), Vitest + Testing Library (jsdom).

## Global Constraints

- TDD: write the failing test before the implementation for every task below.
- TypeScript max-strict: no `any`, no non-null `!`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- i18n: zero hardcoded Hebrew strings in `.tsx` outside `he.json` + `t()`.
- Design spec: `docs/superpowers/specs/2026-07-15-swap-partner-naming-design.md` — read it if any task instruction below is ambiguous.
- Test commands are run from the repo root: `pnpm --filter web exec vitest run <path>` for a single file (the `exec` is required — `pnpm --filter web vitest run <path>` does not resolve on this repo's pnpm version 10.33.2). `pnpm typecheck` and `pnpm test` before considering the whole plan done.
- This correction lands as new commit(s) on `main`, same as every other change today — do not rebase, amend, or force-push anything, including the two already-pushed sibling features this touches.

---

### Task 1: `planRowSwitch` — universal occupant rule

**Files:**
- Modify: `apps/web/src/lib/queue-pairing.ts`
- Modify: `apps/web/src/lib/queue-pairing.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `RowSwitchPlan` shrinks to `{ fromIndex: number; toIndex: number; movedId: string; occupantId: string }` (drops `direction`, `shiftCount`; `occupantId` is now a plain `string`, never `null`). `planRowSwitch`'s signature is unchanged (`(orderIds: string[], oldIndex: number, newIndex: number): RowSwitchPlan | null`). Task 3 imports this new shape.

- [ ] **Step 1: Write the failing tests**

Replace the entire `describe('planRowSwitch', ...)` block at the end of `apps/web/src/lib/queue-pairing.test.ts` with:

```ts
describe('planRowSwitch', () => {
  it('returns null when dropped at the same position', () => {
    expect(planRowSwitch(['a', 'b', 'c'], 1, 1)).toBeNull()
  })

  it('names the immediate neighbor for an adjacent (1-slot) move down', () => {
    expect(planRowSwitch(['a', 'b', 'c', 'd'], 0, 1)).toEqual({
      fromIndex: 0,
      toIndex: 1,
      movedId: 'a',
      occupantId: 'b',
    })
  })

  it('names the immediate neighbor for an adjacent (1-slot) move up', () => {
    expect(planRowSwitch(['a', 'b', 'c', 'd'], 3, 2)).toEqual({
      fromIndex: 3,
      toIndex: 2,
      movedId: 'd',
      occupantId: 'c',
    })
  })

  it('still names just the immediate neighbor for a multi-slot move down, not whoever ends up at toIndex', () => {
    expect(planRowSwitch(['a', 'b', 'c', 'd', 'e'], 0, 3)).toEqual({
      fromIndex: 0,
      toIndex: 3,
      movedId: 'a',
      occupantId: 'b',
    })
  })

  it('still names just the immediate neighbor for a multi-slot move up, not whoever ends up at toIndex', () => {
    expect(planRowSwitch(['a', 'b', 'c', 'd', 'e'], 4, 1)).toEqual({
      fromIndex: 4,
      toIndex: 1,
      movedId: 'e',
      occupantId: 'd',
    })
  })

  it('returns null when oldIndex is out of range', () => {
    expect(planRowSwitch(['a', 'b', 'c'], 5, 1)).toBeNull()
  })

  it('returns null if the computed occupant index would be out of range', () => {
    expect(planRowSwitch(['a', 'b', 'c'], 0, -1)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/lib/queue-pairing.test.ts`
Expected: FAIL — the multi-slot cases now expect `occupantId` values (`'b'`, `'d'`) where the current implementation returns `occupantId: null`, and the expected objects no longer have `direction`/`shiftCount` fields at all while the current implementation still returns them.

- [ ] **Step 3: Write minimal implementation**

Replace the `RowSwitchPlan` interface and `planRowSwitch` function at the end of `apps/web/src/lib/queue-pairing.ts` with:

```ts
export interface RowSwitchPlan {
  fromIndex: number
  toIndex: number
  movedId: string
  /** Whoever now sits in movedId's exact original slot — always present, any move distance. */
  occupantId: string
}

/**
 * Pure decision logic for whether/how to gate a single-row drag
 * (docs/superpowers/specs/2026-07-15-row-switch-confirm-design.md) behind
 * confirmation — no DOM, no dnd-kit, so it's fully unit-testable even
 * though the drag mechanism that calls it (QueueList's handleDragEnd) is
 * not. The occupant is always the original array's immediate neighbor in
 * the direction of the move — true for any distance, not just an adjacent
 * one (docs/superpowers/specs/2026-07-15-swap-partner-naming-design.md).
 */
export function planRowSwitch(orderIds: string[], oldIndex: number, newIndex: number): RowSwitchPlan | null {
  if (oldIndex === newIndex) return null
  const movedId = orderIds[oldIndex]
  if (movedId === undefined) return null
  const direction: 'up' | 'down' = newIndex < oldIndex ? 'up' : 'down'
  const occupantId = direction === 'down' ? orderIds[oldIndex + 1] : orderIds[oldIndex - 1]
  if (occupantId === undefined) return null
  return { fromIndex: oldIndex, toIndex: newIndex, movedId, occupantId }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run src/lib/queue-pairing.test.ts`
Expected: PASS (all tests in the file, including the 7 in `describe('planRowSwitch', ...)`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/queue-pairing.ts apps/web/src/lib/queue-pairing.test.ts
git commit -m "feat(web): always name planRowSwitch's occupant, any move distance"
```

---

### Task 2: `PairSwitchConfirmDialog` — drop unit/shiftCount/direction

**Files:**
- Modify: `apps/web/src/components/PairSwitchConfirmDialog.tsx`
- Modify: `apps/web/src/components/PairSwitchConfirmDialog.test.tsx`
- Modify: `apps/web/src/i18n/he.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PairSwitchConfirmDialogProps` shrinks to `{ open: boolean; onConfirm: () => void; onCancel: () => void; groupANames: string[]; occupantNames: string[] }` — `unit`, `direction`, `shiftCount` removed; `occupantNames` is no longer nullable. Task 3 imports this shape and updates all three call sites in `QueueList.tsx`.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `apps/web/src/components/PairSwitchConfirmDialog.test.tsx` with:

```tsx
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
        occupantNames={['דני', 'עומר']}
      />,
    )
    expect(screen.queryByText(/יוסי/)).toBeNull()
  })

  it('shows a title naming both the moved and the occupant entities', () => {
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי', 'רון']}
        occupantNames={['דני', 'עומר']}
      />,
    )
    expect(screen.getByText('להחליף בין יוסי / רון ⇄ דני / עומר?')).toBeDefined()
  })

  it('does not call onConfirm until confirm is tapped', () => {
    const onConfirm = vi.fn()
    render(
      <PairSwitchConfirmDialog open onConfirm={onConfirm} onCancel={vi.fn()} groupANames={['א', 'ב']} occupantNames={['ג', 'ד']} />,
    )
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm exactly once when confirm is tapped', () => {
    const onConfirm = vi.fn()
    render(
      <PairSwitchConfirmDialog open onConfirm={onConfirm} onCancel={vi.fn()} groupANames={['א', 'ב']} occupantNames={['ג', 'ד']} />,
    )
    fireEvent.click(screen.getByText('אישור'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancel calls onCancel without ever calling onConfirm', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <PairSwitchConfirmDialog open onConfirm={onConfirm} onCancel={onCancel} groupANames={['א', 'ב']} occupantNames={['ג', 'ד']} />,
    )
    fireEvent.click(screen.getByText('ביטול'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/PairSwitchConfirmDialog.test.tsx`
Expected: FAIL — TypeScript error, the current `PairSwitchConfirmDialogProps` requires `direction`/`shiftCount`/`unit` that these tests don't pass, and `occupantNames` is typed `string[] | null` so a plain `string[]` narrows fine but the missing required fields fail to compile.

- [ ] **Step 3: Update `he.json`**

In `apps/web/src/i18n/he.json`, delete these two lines entirely:

```json
  "queue.rowSwitch.confirmMultiDown": "להזיז את {groupA} למטה? (עוד {count} קבוצות יזוזו מקום)",
  "queue.rowSwitch.confirmMultiUp": "להזיז את {groupA} למעלה? (עוד {count} קבוצות יזוזו מקום)",
```

Then replace this line:

```json
  "queue.pairSwitch.confirmAdjacent": "להחליף בין {groupA} ⇄ {groupB}?",
```

with:

```json
  "queue.pairSwitch.confirmSwap": "להחליף בין {groupA} ⇄ {groupB}?",
```

Then delete these two lines (immediately below the renamed one, before `"queue.pairSwitch.confirm"`):

```json
  "queue.pairSwitch.confirmMultiDown": "להזיז את {groupA} למטה? (עוד {count} זוגות יזוזו מקום)",
  "queue.pairSwitch.confirmMultiUp": "להזיז את {groupA} למעלה? (עוד {count} זוגות יזוזו מקום)",
```

`queue.pairSwitch.confirm` and `queue.pairSwitch.cancel` (the button labels) are untouched.

- [ ] **Step 4: Write minimal implementation**

Replace the full contents of `apps/web/src/components/PairSwitchConfirmDialog.tsx` with:

```tsx
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'

/**
 * Single responsibility: the one exception (besides RematchConfirmDialog) to
 * the no-popup policy (design.md §4) — requires explicit confirmation before
 * a queue reorder commits, since staff running the line are non-technical
 * and a reorder can shift several other entries' positions at once. Always
 * names two specific entities — the one moved and whichever one lands in its
 * exact original slot — even for a move spanning several other entries in
 * between, which shift silently
 * (docs/superpowers/specs/2026-07-15-swap-partner-naming-design.md). Three
 * callers share this dialog: the pair-grip drag, the single-row ☰ drag, and
 * the ⋯-menu move-to-top/bottom. There's no submitting/error state here,
 * unlike RematchConfirmDialog — each caller owns applying its own action
 * (with or without local optimism) and reverting on failure; Confirm just
 * closes this dialog and lets the caller's own path run.
 */
export interface PairSwitchConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  /** The moved pair's (or single row's) name(s), e.g. ["יוסי", "רון"] or ["יוסי"]. */
  groupANames: string[]
  /** The pair/row now sitting in groupANames' original slot — always present. */
  occupantNames: string[]
}

export function PairSwitchConfirmDialog({ open, onConfirm, onCancel, groupANames, occupantNames }: PairSwitchConfirmDialogProps) {
  const title = t('queue.pairSwitch.confirmSwap', { groupA: groupANames.join(' / '), groupB: occupantNames.join(' / ') })

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

Run: `pnpm --filter web exec vitest run src/components/PairSwitchConfirmDialog.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/PairSwitchConfirmDialog.tsx apps/web/src/components/PairSwitchConfirmDialog.test.tsx apps/web/src/i18n/he.json
git commit -m "feat(web): simplify PairSwitchConfirmDialog to always name a swap partner"
```

---

### Task 3: `QueueList` — wire the universal rule into all three flows

**Files:**
- Modify: `apps/web/src/components/QueueList.tsx`
- Modify: `apps/web/src/components/QueueList.test.tsx`

**Interfaces:**
- Consumes: `RowSwitchPlan`'s new shape (Task 1) from `@/lib/queue-pairing`; `PairSwitchConfirmDialogProps`'s new shape (Task 2) from `@/components/PairSwitchConfirmDialog`.
- Produces: nothing new for further tasks — Task 4 is verification only.

- [ ] **Step 1: Rewrite the affected tests**

In `apps/web/src/components/QueueList.test.tsx`, replace the two tests `'opens a two-way switch confirmation on drop, and only reorders after confirming'` and `'shows a multi-pair-shift count instead of a two-way switch when dragging across more than one slot'` (inside `describe('pair drag gesture — dragging', ...)`) with:

```tsx
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
```

Also update the cancel test in the same `describe` block — it currently asserts `screen.queryByText('להחליף בין א / ב ⇄ ג / ד?')).toBeNull()` after cancelling, which is unaffected by this change and needs no edit.

Replace the two tests `'opens a confirmation naming both entries for an adjacent move, and only calls moveTop after confirming'` and `'shows a team-count title for a multi-slot move to bottom, and only calls moveBottom after confirming'` (inside `describe('move-to-top/bottom confirmation', ...)`) with:

```tsx
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
```

The `describe('move-to-top/bottom confirmation', ...)` block's cancel test and already-at-extreme test are unaffected — they don't assert specific dialog text — and need no changes.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/QueueList.test.tsx`
Expected: FAIL — the rewritten tests expect swap-style titles the current code doesn't produce yet (it still shows count-based titles for these multi-slot scenarios), and the file won't even compile until `QueueList.tsx`'s `PairSwitchConfirmDialog` call sites match Task 2's new prop shape.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/src/components/QueueList.tsx`, replace the three pending-state interfaces:

```ts
interface PendingSwitch {
  groupId: string
  toIndex: number
  groupANames: string[]
  occupantNames: string[]
}

interface PendingRowSwitch {
  previousOrder: string[]
  nextOrder: string[]
  movedId: string
  occupantId: string
}

interface PendingMoveEnd {
  entryId: string
  end: 'top' | 'bottom'
  groupANames: string[]
  occupantNames: string[]
}
```

Replace `handleDragEnd`:

```ts
  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderIds.indexOf(String(active.id))
    const newIndex = orderIds.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const plan = planRowSwitch(orderIds, oldIndex, newIndex)
    if (!plan) return
    const previousOrder = orderIds
    const nextOrder = arrayMove(orderIds, oldIndex, newIndex)
    setOrderIds(nextOrder)
    setPendingRowSwitch({
      previousOrder,
      nextOrder,
      movedId: plan.movedId,
      occupantId: plan.occupantId,
    })
  }
```

Replace `onDragEnd` (the pair-grip drag's pointer-up handler):

```ts
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

    // Whichever group lands in the dragged group's exact original slot is
    // always the original array's immediate neighbor in the direction of the
    // move — true for any drag distance, not just an adjacent one
    // (docs/superpowers/specs/2026-07-15-swap-partner-naming-design.md).
    const direction: 'up' | 'down' = toIndex < fromIndex ? 'up' : 'down'
    const occupantGroup = direction === 'down' ? currentPairGroups[fromIndex + 1] : currentPairGroups[fromIndex - 1]
    if (!occupantGroup) {
      flushSync(() => clearDragState())
      return
    }

    setPendingSwitch({
      groupId,
      toIndex,
      groupANames: namesOf(movedGroup, currentById),
      occupantNames: namesOf(occupantGroup, currentById),
    })
    // Drag refs/state are deliberately left as-is here (not cleared) — the floating
    // card and the live-reflow placeholder gap stay frozen at the drop target while
    // the confirmation dialog is open.
  }
```

Replace `handleRequestMoveEnd`:

```ts
  function handleRequestMoveEnd(entryId: string, end: 'top' | 'bottom'): void {
    const oldIndex = orderIds.indexOf(entryId)
    const newIndex = end === 'top' ? 0 : orderIds.length - 1
    const plan = planRowSwitch(orderIds, oldIndex, newIndex)
    if (!plan) return
    setPendingMoveEnd({
      entryId,
      end,
      groupANames: namesOf({ entryIds: [plan.movedId] }, byId),
      occupantNames: namesOf({ entryIds: [plan.occupantId] }, byId),
    })
  }
```

Replace the three `PairSwitchConfirmDialog` JSX render calls:

```tsx
      {pendingSwitch && (
        <PairSwitchConfirmDialog
          open
          onConfirm={handleConfirmSwitch}
          onCancel={handleCancelSwitch}
          groupANames={pendingSwitch.groupANames}
          occupantNames={pendingSwitch.occupantNames}
        />
      )}
      {pendingRowSwitch && (
        <PairSwitchConfirmDialog
          open
          onConfirm={handleConfirmRowSwitch}
          onCancel={handleCancelRowSwitch}
          groupANames={namesOf({ entryIds: [pendingRowSwitch.movedId] }, byId)}
          occupantNames={namesOf({ entryIds: [pendingRowSwitch.occupantId] }, byId)}
        />
      )}
```

(This is the pair-grip and row-drag dialogs, which sit next to each other in the file. The `QueueActionsSheet` render call in between is unaffected — leave it exactly as-is.)

```tsx
      {pendingMoveEnd && (
        <PairSwitchConfirmDialog
          open
          onConfirm={handleConfirmMoveEnd}
          onCancel={handleCancelMoveEnd}
          groupANames={pendingMoveEnd.groupANames}
          occupantNames={pendingMoveEnd.occupantNames}
        />
      )}
```

`handleConfirmSwitch`, `handleCancelSwitch`, `handleConfirmRowSwitch`, `handleCancelRowSwitch`, `handleConfirmMoveEnd`, `handleCancelMoveEnd` are all untouched by this task — none of them read `direction`/`shiftCount`/`unit` today.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run src/components/QueueList.test.tsx`
Expected: PASS (every test in the file, including the 4 rewritten ones).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/QueueList.tsx apps/web/src/components/QueueList.test.tsx
git commit -m "feat(web): wire the universal swap-partner rule into all three reorder flows"
```

---

### Task 4: Full verification and manual QA

**Files:** none (verification only).

- [ ] **Step 1: Run full typecheck and test suite**

```bash
pnpm typecheck
pnpm test
```

Expected: typecheck clean across all packages; `shared`/`web` fully green. `apps/api`'s `test/actions.int.test.ts` undo-timing-window tests may still show pre-existing flakiness under full-suite load (confirmed unrelated to this branch's work in the prior feature's final review — re-run that file alone if it fails, and expect it clean in isolation).

- [ ] **Step 2: Manual verification against the dev server**

Run `pnpm dev` (or `cd apps/web && VITE_DEMO=1 pnpm dev`), open the app with an active session and at least 6-8 queue entries, and check:

- Drag a pair-grip one slot: dialog names both pairs, e.g. "להחליף בין X ⇄ Y?".
- Drag a pair-grip across 2+ slots: dialog still names exactly two pairs (mover + immediate original neighbor), no count anywhere — confirm the result still reorders every pair that should shift, not just the two named ones.
- Drag a single row (☰) both 1 slot and 2+ slots: same swap-style wording both times.
- Tap "לראש התור"/"לסוף התור" on an entry 2+ slots from that end: dialog names the entry and its immediate neighbor, not a count.
- No dialog anywhere shows "עוד N זוגות/קבוצות יזוזו מקום" — that phrasing should be fully gone from the app.

- [ ] **Step 3: Update the plan's status**

Mark all tasks above complete. No separate commit needed — this task only verifies work already committed in Tasks 1–3.

## Self-Review

**Spec coverage:** universal occupant rule (Task 1's `planRowSwitch`, Task 3's `onDragEnd`) — dialog prop simplification + i18n key rename/removal (Task 2) — all three call sites updated with no leftover `unit`/`direction`/`shiftCount` (Task 3) — every section of `docs/superpowers/specs/2026-07-15-swap-partner-naming-design.md` has a task.

**Placeholder scan:** none — every step has complete, runnable code.

**Type consistency:** `RowSwitchPlan`'s new shape (`fromIndex`, `toIndex`, `movedId`, `occupantId: string`) matches between Task 1's definition and Task 3's `handleDragEnd`/`handleRequestMoveEnd` usage. `PairSwitchConfirmDialogProps`'s new shape (`open`, `onConfirm`, `onCancel`, `groupANames`, `occupantNames: string[]`) matches between Task 2's definition and all three of Task 3's call sites. `PendingSwitch`/`PendingRowSwitch`/`PendingMoveEnd` all drop `direction`/`shiftCount` consistently, matching that none of their confirm/cancel handlers ever read those fields.
