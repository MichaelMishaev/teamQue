# Single-row drag confirmation dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate `QueueList`'s single-row dnd-kit drag (`handleDragEnd`, the ☰ handle) behind the same confirmation dialog pattern the pair-grip drag already uses, so every reorder on this screen — not just pair-level moves — requires explicit staff confirmation before it commits.

**Architecture:** A new pure helper (`planRowSwitch`) decides magnitude/occupant/direction for a single-row move, exactly mirroring the pair-drag's existing math but without any DOM/gesture coupling. `PairSwitchConfirmDialog` gains a `unit: 'pair' | 'team'` prop so its existing adjacent-swap/multi-shift-count copy works correctly for both flows. `QueueList`'s `handleDragEnd` becomes a thin wrapper: it still applies the reorder to local state immediately (unchanged, this is what makes dnd-kit's drop animation play), but defers `actions.reorderLine` until the user confirms — no custom freeze/timer machinery is needed here, unlike the pair-drag, because dnd-kit's own `orderIds`-driven animation already covers both the drop and a would-be cancel-revert.

**Tech Stack:** React 19, TypeScript (strict), Tailwind v4, Vitest + Testing Library (jsdom).

## Global Constraints

- TDD: write the failing test before the implementation for every task below, wherever a test is possible (see Task 3's note on `handleDragEnd`'s testability).
- TypeScript max-strict: no `any`, no non-null `!`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — optional props are omitted via conditional spread, never passed as literal `undefined`.
- i18n: zero hardcoded Hebrew strings in `.tsx` — every user-facing string goes through `apps/web/src/i18n/he.json` + `t()`.
- Tokens: components use semantic Tailwind utilities — never a raw hex value. This plan adds no new layout/RTL surface (it reuses `PairSwitchConfirmDialog`'s existing markup unchanged), so no new RTL rules apply.
- Design spec: `docs/superpowers/specs/2026-07-15-row-switch-confirm-design.md` — read it if any task instruction below is ambiguous.
- Test commands are run from the repo root: `pnpm --filter web exec vitest run <path>` for a single file (note: `pnpm --filter web vitest run <path>`, without `exec`, does NOT resolve on this repo's pnpm version 10.33.2 — always use the `exec` form). `pnpm typecheck` and `pnpm test` before considering the whole plan done.

---

### Task 1: `planRowSwitch` pure helper

**Files:**
- Modify: `apps/web/src/lib/queue-pairing.ts`
- Modify: `apps/web/src/lib/queue-pairing.test.ts`

**Interfaces:**
- Consumes: nothing new (pure function over plain arrays of ids).
- Produces: `RowSwitchPlan` (`{ fromIndex: number; toIndex: number; movedId: string; direction: 'up' | 'down'; occupantId: string | null; shiftCount: number }`), `planRowSwitch(orderIds: string[], oldIndex: number, newIndex: number): RowSwitchPlan | null`. Task 3 imports and calls this from `@/lib/queue-pairing`.

- [ ] **Step 1: Write the failing tests**

Add `planRowSwitch` to the existing import line at the top of `apps/web/src/lib/queue-pairing.test.ts`:

```ts
import { MATCH_GAP_SEC, buildPairGroups, computeBaseSec, planRowSwitch, reorderGroups } from './queue-pairing'
```

Then add this `describe` block to the end of the file:

```ts
describe('planRowSwitch', () => {
  it('returns null when dropped at the same position', () => {
    expect(planRowSwitch(['a', 'b', 'c'], 1, 1)).toBeNull()
  })

  it('names both entries for an adjacent (1-slot) move down', () => {
    expect(planRowSwitch(['a', 'b', 'c', 'd'], 0, 1)).toEqual({
      fromIndex: 0,
      toIndex: 1,
      movedId: 'a',
      direction: 'down',
      occupantId: 'b',
      shiftCount: 1,
    })
  })

  it('names both entries for an adjacent (1-slot) move up', () => {
    expect(planRowSwitch(['a', 'b', 'c', 'd'], 3, 2)).toEqual({
      fromIndex: 3,
      toIndex: 2,
      movedId: 'd',
      direction: 'up',
      occupantId: 'c',
      shiftCount: 1,
    })
  })

  it('has no occupant and carries a count for a multi-slot move down', () => {
    expect(planRowSwitch(['a', 'b', 'c', 'd', 'e'], 0, 3)).toEqual({
      fromIndex: 0,
      toIndex: 3,
      movedId: 'a',
      direction: 'down',
      occupantId: null,
      shiftCount: 3,
    })
  })

  it('has no occupant and carries a count for a multi-slot move up', () => {
    expect(planRowSwitch(['a', 'b', 'c', 'd', 'e'], 4, 1)).toEqual({
      fromIndex: 4,
      toIndex: 1,
      movedId: 'e',
      direction: 'up',
      occupantId: null,
      shiftCount: 3,
    })
  })

  it('returns null when oldIndex is out of range', () => {
    expect(planRowSwitch(['a', 'b', 'c'], 5, 1)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/lib/queue-pairing.test.ts`
Expected: FAIL — `planRowSwitch` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to the end of `apps/web/src/lib/queue-pairing.ts`:

```ts
export interface RowSwitchPlan {
  fromIndex: number
  toIndex: number
  movedId: string
  direction: 'up' | 'down'
  occupantId: string | null
  shiftCount: number
}

/**
 * Pure decision logic for whether/how to gate a single-row drag
 * (docs/superpowers/specs/2026-07-15-row-switch-confirm-design.md) behind
 * confirmation — no DOM, no dnd-kit, so it's fully unit-testable even
 * though the drag mechanism that calls it (QueueList's handleDragEnd) is
 * not. Mirrors the pair-drag's magnitude/occupant math: moving an entry by
 * N slots always displaces exactly N others by one slot each — magnitude 1
 * is a genuine two-way swap (name both), anything more sets occupantId to
 * null and carries a count instead.
 */
export function planRowSwitch(orderIds: string[], oldIndex: number, newIndex: number): RowSwitchPlan | null {
  if (oldIndex === newIndex) return null
  const movedId = orderIds[oldIndex]
  if (movedId === undefined) return null
  const magnitude = Math.abs(newIndex - oldIndex)
  const occupantId = magnitude === 1 ? (orderIds[newIndex] ?? null) : null
  return {
    fromIndex: oldIndex,
    toIndex: newIndex,
    movedId,
    direction: newIndex < oldIndex ? 'up' : 'down',
    occupantId,
    shiftCount: magnitude,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run src/lib/queue-pairing.test.ts`
Expected: PASS (all previous tests plus the 6 new ones).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/queue-pairing.ts apps/web/src/lib/queue-pairing.test.ts
git commit -m "feat(web): add pure planRowSwitch helper for single-row drag confirmation"
```

---

### Task 2: `PairSwitchConfirmDialog` — generalize to a `unit` prop

**Files:**
- Modify: `apps/web/src/components/PairSwitchConfirmDialog.tsx`
- Modify: `apps/web/src/components/PairSwitchConfirmDialog.test.tsx`
- Modify: `apps/web/src/i18n/he.json` (insert 2 keys immediately after the existing `"queue.pairSwitch.cancel"` line)

**Interfaces:**
- Consumes: nothing new.
- Produces: `PairSwitchConfirmDialogProps` gains a required `unit: 'pair' | 'team'` field. Task 3 imports this and passes `unit="pair"` (existing pair-drag call site) or `unit="team"` (new row-drag call site).

- [ ] **Step 1: Update the failing tests**

In `apps/web/src/components/PairSwitchConfirmDialog.test.tsx`, add `unit="pair"` to every existing `<PairSwitchConfirmDialog ... />` call (all 7 of them — the prop is now required, so TypeScript will fail to compile until every call site is updated). For example, the first test becomes:

```tsx
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
        unit="pair"
      />,
    )
    expect(screen.queryByText(/יוסי/)).toBeNull()
  })
```

Apply the same `unit="pair"` addition to the other 6 tests in the file (`shows a two-way switch title...`, `shows a move-down-with-count title...`, `shows a move-up-with-count title...`, `does not call onConfirm...`, `calls onConfirm exactly once...`, `cancel calls onCancel...`) — every prop and assertion in those tests stays exactly as it is today, only the new `unit="pair"` line is added to each render call.

Then add these 2 new tests at the end of the file, before the closing `})` of the `describe('PairSwitchConfirmDialog', ...)` block:

```tsx
  it('shows a move-down-with-team-count title when unit is "team"', () => {
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי']}
        direction="down"
        occupantNames={null}
        shiftCount={3}
        unit="team"
      />,
    )
    expect(screen.getByText('להזיז את יוסי למטה? (עוד 3 קבוצות יזוזו מקום)')).toBeDefined()
  })

  it('shows a move-up-with-team-count title when unit is "team"', () => {
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי']}
        direction="up"
        occupantNames={null}
        shiftCount={2}
        unit="team"
      />,
    )
    expect(screen.getByText('להזיז את יוסי למעלה? (עוד 2 קבוצות יזוזו מקום)')).toBeDefined()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/PairSwitchConfirmDialog.test.tsx`
Expected: FAIL — TypeScript error, `unit` does not exist on `PairSwitchConfirmDialogProps` (all 9 tests fail to even compile).

- [ ] **Step 3: Add the 2 new i18n keys**

In `apps/web/src/i18n/he.json`, immediately after the line `"queue.pairSwitch.cancel": "ביטול",`, add:

```json
  "queue.rowSwitch.confirmMultiDown": "להזיז את {groupA} למטה? (עוד {count} קבוצות יזוזו מקום)",
  "queue.rowSwitch.confirmMultiUp": "להזיז את {groupA} למעלה? (עוד {count} קבוצות יזוזו מקום)",
```

- [ ] **Step 4: Update the component**

Replace the full contents of `apps/web/src/components/PairSwitchConfirmDialog.tsx` with:

```tsx
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { t, type MessageKey } from '@/i18n'

/**
 * Single responsibility: the one exception (besides RematchConfirmDialog) to
 * the no-popup policy (design.md §4) — requires explicit confirmation before
 * a queue reorder commits, since staff running the line are non-technical
 * and a drag can shift several other entries' positions at once. Serves two
 * flows sharing the same freeze-then-confirm shape but different nouns in
 * their copy: the pair-grip drag (`unit="pair"`,
 * docs/superpowers/specs/2026-07-15-pair-switch-confirm-design.md) and the
 * single-row ☰ drag (`unit="team"`,
 * docs/superpowers/specs/2026-07-15-row-switch-confirm-design.md). Unlike
 * RematchConfirmDialog, there's no submitting/error state here — QueueList
 * already applies every reorder optimistically and reverts on failure, so
 * Confirm just closes this dialog and lets that existing path run.
 */
export interface PairSwitchConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  /** The dragged pair's (or single row's) name(s), e.g. ["יוסי", "רון"] or ["יוסי"]. */
  groupANames: string[]
  direction: 'up' | 'down'
  /** The one pair/row displaced by an adjacent (1-slot) move — null for a multi-slot move. */
  occupantNames: string[] | null
  /** How many other pairs/rows shift by one slot — only shown when occupantNames is null. */
  shiftCount: number
  /** Selects which multi-shift i18n keys to use ("זוגות" vs "קבוצות") when occupantNames is null. */
  unit: 'pair' | 'team'
}

export function PairSwitchConfirmDialog({
  open,
  onConfirm,
  onCancel,
  groupANames,
  direction,
  occupantNames,
  shiftCount,
  unit,
}: PairSwitchConfirmDialogProps) {
  const groupA = groupANames.join(' / ')
  const multiKey: MessageKey =
    unit === 'pair'
      ? direction === 'up'
        ? 'queue.pairSwitch.confirmMultiUp'
        : 'queue.pairSwitch.confirmMultiDown'
      : direction === 'up'
        ? 'queue.rowSwitch.confirmMultiUp'
        : 'queue.rowSwitch.confirmMultiDown'
  const title = occupantNames
    ? t('queue.pairSwitch.confirmAdjacent', { groupA, groupB: occupantNames.join(' / ') })
    : t(multiKey, { groupA, count: shiftCount })

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
Expected: PASS (9 tests — the original 7 plus the 2 new `unit="team"` tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/PairSwitchConfirmDialog.tsx apps/web/src/components/PairSwitchConfirmDialog.test.tsx apps/web/src/i18n/he.json
git commit -m "feat(web): generalize PairSwitchConfirmDialog with a pair/team unit prop"
```

---

### Task 3: `QueueList` — gate `handleDragEnd` behind confirmation

**Files:**
- Modify: `apps/web/src/components/QueueList.tsx`

**Interfaces:**
- Consumes: `planRowSwitch`, `RowSwitchPlan` (Task 1) from `@/lib/queue-pairing`; `PairSwitchConfirmDialogProps`'s new `unit` field (Task 2) from `@/components/PairSwitchConfirmDialog`.
- Produces: nothing new for further tasks — Task 4 is verification only.

**A note on testability, read before starting:** `handleDragEnd` is only ever invoked by dnd-kit's own sensor/collision-detection pipeline via `<DndContext onDragEnd={handleDragEnd}>` — it is a closure over component state, not exported, and there is no way to call it directly from a test without going through a real (or realistically faked) dnd-kit drag interaction. This repo has never unit-tested that interaction (see `docs/superpowers/plans/2026-07-13-queue-pair-move.md` Task 7: "this codebase does not unit-test the pixel geometry of the existing per-row dnd-kit drag either... verified manually against the dev server, not in jsdom") — `QueueList.test.tsx` today has zero tests exercising `handleDragEnd`, before or after this task. This task does not change that: `planRowSwitch`'s logic is already fully covered by Task 1's pure unit tests, and `handleDragEnd` itself becomes a thin wrapper around it. This task's verification is therefore: (a) the full existing `QueueList.test.tsx` suite must keep passing unchanged (regression safety — nothing here should touch the pair-drag or predicted-pairing tests), (b) `pnpm typecheck` must be clean, and (c) Task 4's manual dev-server check is what actually exercises this wiring end-to-end, exactly like the pre-existing `handleDragEnd` always has been.

- [ ] **Step 1: Run the existing test suite to record a baseline**

Run: `pnpm --filter web exec vitest run src/components/QueueList.test.tsx`
Expected: PASS (21/21, unchanged from before this task — record this as the baseline you'll re-check after Step 3).

- [ ] **Step 2: Run typecheck to confirm today's starting point is clean**

Run: `pnpm --filter web exec tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Implement the wiring**

In `apps/web/src/components/QueueList.tsx`, add `planRowSwitch` to the existing import from `@/lib/queue-pairing`:

```ts
import { buildPairGroups, planRowSwitch, reorderGroups } from '@/lib/queue-pairing'
```

Add this interface next to the existing `PendingSwitch` interface (after its closing `}`, i.e. after line 75 in the file as it stands before this task):

```ts
interface PendingRowSwitch {
  previousOrder: string[]
  nextOrder: string[]
  movedId: string
  direction: 'up' | 'down'
  occupantId: string | null
  shiftCount: number
}
```

Add a new state declaration next to the existing `pendingSwitch` state (after the line `const [pendingSwitch, setPendingSwitch] = useState<PendingSwitch | null>(null)`):

```ts
  const [pendingRowSwitch, setPendingRowSwitch] = useState<PendingRowSwitch | null>(null)
```

Replace the existing `handleDragEnd` function body:

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
      direction: plan.direction,
      occupantId: plan.occupantId,
      shiftCount: plan.shiftCount,
    })
  }
```

Add these two new handler functions immediately after `handleCancelSwitch` (i.e. after its closing `}`):

```ts
  function handleConfirmRowSwitch(): void {
    const pending = pendingRowSwitch
    if (!pending) return
    setPendingRowSwitch(null)
    actions.reorderLine(pending.nextOrder).catch(() => {
      setOrderIds(pending.previousOrder)
      onError?.(t('queue.actions.error'))
    })
  }

  function handleCancelRowSwitch(): void {
    const pending = pendingRowSwitch
    if (!pending) return
    setOrderIds(pending.previousOrder)
    setPendingRowSwitch(null)
  }
```

Add `unit="pair"` to the existing pair-drag dialog render call (the one already gated on `pendingSwitch`):

```tsx
      {pendingSwitch && (
        <PairSwitchConfirmDialog
          open
          unit="pair"
          onConfirm={handleConfirmSwitch}
          onCancel={handleCancelSwitch}
          groupANames={pendingSwitch.groupANames}
          direction={pendingSwitch.direction}
          occupantNames={pendingSwitch.occupantNames}
          shiftCount={pendingSwitch.shiftCount}
        />
      )}
```

Add a second, independent conditional render immediately after it (still before the `{menuEntry && ...}` line):

```tsx
      {pendingRowSwitch && (
        <PairSwitchConfirmDialog
          open
          unit="team"
          onConfirm={handleConfirmRowSwitch}
          onCancel={handleCancelRowSwitch}
          groupANames={namesOf({ entryIds: [pendingRowSwitch.movedId] }, byId)}
          direction={pendingRowSwitch.direction}
          occupantNames={pendingRowSwitch.occupantId ? namesOf({ entryIds: [pendingRowSwitch.occupantId] }, byId) : null}
          shiftCount={pendingRowSwitch.shiftCount}
        />
      )}
```

Finally, update the file's top JSDoc comment — replace the existing final sentence of the second paragraph (the one ending "...(docs/superpowers/specs/2026-07-15-pair-switch-confirm-design.md).") by adding one more sentence directly after it:

```
 * The single-row ☰ drag (dnd-kit, handleDragEnd) is gated the same way,
 * though with no drag-visual-freeze step — dnd-kit already animates the
 * drop via the same orderIds state this defers committing to the server
 * (docs/superpowers/specs/2026-07-15-row-switch-confirm-design.md).
```

- [ ] **Step 4: Run the existing test suite to confirm no regressions**

Run: `pnpm --filter web exec vitest run src/components/QueueList.test.tsx`
Expected: PASS (21/21 — identical to Step 1's baseline; this task adds no new automated tests to this file, per the testability note above).

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter web exec tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/QueueList.tsx
git commit -m "feat(web): confirm single-row queue drags before applying them"
```

---

### Task 4: Full verification and manual QA

**Files:** none (verification only).

- [ ] **Step 1: Run full typecheck and test suite**

```bash
pnpm typecheck
pnpm test
```

Expected: both succeed with no errors (strict tsc across all packages; full vitest run across `shared`/`web`/`api`).

- [ ] **Step 2: Manual verification against the dev server**

`handleDragEnd`'s real dnd-kit interaction is not covered by any jsdom test (per Task 3's note) — this is the step that actually proves the wiring works, same as it always has been for this drag mechanism. Run `pnpm dev` (or `cd apps/web && VITE_DEMO=1 pnpm dev` for the in-memory mock session), open the app with an active session and at least 5 queue entries, and check:

- Dragging a single row via its ☰ handle to an adjacent slot and releasing opens a confirmation naming both entries (e.g. "להחליף בין X ⇄ Y?"), with no reorder applied to the server yet.
- Dragging a single row across 2+ slots instead shows the team-count wording ("להזיז את X למטה/למעלה? (עוד N קבוצות יזוזו מקום)").
- Tapping אישור applies the reorder (the row stays where dnd-kit already animated it).
- Tapping ביטול reverts the row back to its original position.
- Dropping a row back at its own original position shows no dialog at all.
- The trailing solo (unpaired) entry's row is gated identically to any other row — drag it and confirm the same dialog behavior applies.
- The pair-grip drag (⋮⋮, double-tap-and-hold) still behaves exactly as before this task — freeze-then-confirm, unaffected by this change.

- [ ] **Step 3: Update the plan's status**

Mark all tasks above complete. No separate commit needed — this task only verifies work already committed in Tasks 1–3.

## Self-Review

**Spec coverage:** scope (every row drag gated, Task 3) — mechanism (optimistic-apply-and-defer, no freeze, Task 3's `handleDragEnd`/`handleConfirmRowSwitch`/`handleCancelRowSwitch`) — magnitude/occupant math (Task 1's `planRowSwitch`, fully unit-tested) — component generalization (`unit` prop, Task 2) — edge cases (drop-at-original-position already no-ops via `planRowSwitch`'s `oldIndex === newIndex` guard; solo entry gated identically since `handleDragEnd` doesn't distinguish row types; reorderLine-rejects path reuses the existing error pattern) — every section of `docs/superpowers/specs/2026-07-15-row-switch-confirm-design.md` has a task.

**Placeholder scan:** none — every step has complete, runnable code.

**Type consistency:** `RowSwitchPlan`'s fields (`fromIndex`, `toIndex`, `movedId`, `direction`, `occupantId`, `shiftCount`) match between Task 1's definition and Task 3's `PendingRowSwitch`/`handleDragEnd` usage. `PairSwitchConfirmDialogProps`'s new `unit` field matches between Task 2's definition and both Task 3 call sites (`unit="pair"`, `unit="team"`). `namesOf` (already defined in `QueueList.tsx` before this plan) is reused unchanged in Task 3 with a `{ entryIds: [id] }` wrapper — no new helper duplicated. `planRowSwitch`'s `null` return (same-position or out-of-range) matches `handleDragEnd`'s `if (!plan) return` guard.
