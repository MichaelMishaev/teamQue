# Move-to-top/bottom confirmation dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate `QueueActionsSheet`'s "לראש התור" (move to top) / "לסוף התור" (move to bottom) menu actions behind the same `PairSwitchConfirmDialog`-based confirmation the two drag mechanisms already use, closing the last unprotected reorder path in this queue screen.

**Architecture:** `QueueActionsSheet` becomes dumb about these two actions — it just calls new `onRequestMoveTop`/`onRequestMoveBottom` props and closes itself, instead of calling `actions.moveTop`/`moveBottom` directly. `QueueList` (which already owns the analogous state for both drags) computes a plan via the existing `planRowSwitch` pure helper, shows the confirmation dialog, and only calls the real `actions.moveTop`/`moveBottom` on confirm. No optimistic local reordering is needed — unlike both drags, these actions already only update the UI once a fresh realtime snapshot arrives, so there's no `previousOrder`/`nextOrder` pair to manage.

**Tech Stack:** React 19, TypeScript (strict), Vitest + Testing Library (jsdom).

## Global Constraints

- TDD: write the failing test before the implementation for every task below.
- TypeScript max-strict: no `any`, no non-null `!`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — optional props are omitted via conditional spread, never passed as literal `undefined`.
- i18n: no new keys are needed for this plan — the dialog reuses `queue.pairSwitch.confirmAdjacent`, `queue.rowSwitch.confirmMultiUp`/`confirmMultiDown`, `queue.pairSwitch.confirm`/`cancel` exactly as the row-drag feature left them.
- Design spec: `docs/superpowers/specs/2026-07-15-move-end-confirm-design.md` — read it if any task instruction below is ambiguous.
- Test commands are run from the repo root: `pnpm --filter web exec vitest run <path>` for a single file (the `exec` is required — `pnpm --filter web vitest run <path>` does not resolve on this repo's pnpm version 10.33.2). `pnpm typecheck` and `pnpm test` before considering the whole plan done.
- Unlike the row-drag feature's `QueueList.tsx` wiring, this feature's flows ARE fully unit-testable — `QueueActionsSheet` and the ⋯-menu click path are plain React components/events, not dnd-kit's real sensor pipeline. Both tasks below use ordinary `fireEvent.click`.

---

### Task 1: `QueueActionsSheet` — replace direct calls with request props

**Files:**
- Modify: `apps/web/src/components/QueueActionsSheet.tsx`
- Modify: `apps/web/src/components/QueueActionsSheet.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `QueueActionsSheetProps` gains two required fields, `onRequestMoveTop: () => void` and `onRequestMoveBottom: () => void`. Task 2 imports these exact names and wires them from `QueueList.tsx`.

- [ ] **Step 1: Write the failing tests**

Replace the existing two tests `'move to top calls moveTop with this entry id'` and `'move to bottom calls moveBottom with this entry id'` in `apps/web/src/components/QueueActionsSheet.test.tsx` with:

```tsx
  it('move to top calls onRequestMoveTop and closes the sheet, without calling moveTop directly', () => {
    const onRequestMoveTop = vi.fn()
    const { actions, onClose } = renderSheet(entry('e2', 'ג', 2), {}, onRequestMoveTop)
    fireEvent.click(screen.getByText('לראש התור'))
    expect(onRequestMoveTop).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(actions.moveTop).not.toHaveBeenCalled()
  })

  it('move to bottom calls onRequestMoveBottom and closes the sheet, without calling moveBottom directly', () => {
    const onRequestMoveBottom = vi.fn()
    const { actions, onClose } = renderSheet(entry('e2', 'ג', 2), {}, vi.fn(), onRequestMoveBottom)
    fireEvent.click(screen.getByText('לסוף התור'))
    expect(onRequestMoveBottom).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(actions.moveBottom).not.toHaveBeenCalled()
  })
```

Update the `renderSheet` helper (near the top of the file) to accept the two new required props with defaults, so every other existing call site (which only ever passes 1-2 arguments) keeps compiling unchanged:

```tsx
function renderSheet(
  target: QueueEntryView,
  actionsOverrides: Partial<SessionActions> = {},
  onRequestMoveTop: () => void = vi.fn(),
  onRequestMoveBottom: () => void = vi.fn(),
) {
  const actions = { ...noop(), ...actionsOverrides }
  const onClose = vi.fn()
  render(
    <SessionActionsContext.Provider value={actions}>
      <QueueActionsSheet
        open
        onClose={onClose}
        entry={target}
        onRequestMoveTop={onRequestMoveTop}
        onRequestMoveBottom={onRequestMoveBottom}
      />
    </SessionActionsContext.Provider>,
  )
  return { actions, onClose }
}
```

Finally, add the same two required props to the one test that renders `<QueueActionsSheet>` directly instead of via `renderSheet` (the test named `'keeps the rename input open when the parent re-renders with a fresh onClose (1s clock tick)'`, which has two separate `<QueueActionsSheet ...>` JSX blocks — a `render(...)` call and a `rerender(...)` call). Add `onRequestMoveTop={vi.fn()} onRequestMoveBottom={vi.fn()}` to **both** of them.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/QueueActionsSheet.test.tsx`
Expected: FAIL — TypeScript error, `onRequestMoveTop`/`onRequestMoveBottom` do not exist on `QueueActionsSheetProps` yet.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `apps/web/src/components/QueueActionsSheet.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { showUndoToast } from '@/components/UndoToast'
import { t } from '@/i18n'
import { cn } from '@/lib/cn'
import type { QueueEntryView } from 'shared'
import { useSessionActions } from '@/state/SessionActions'

/**
 * Single responsibility: the line row ⋯ menu (client-prd §3.1, task brief
 * item 5) — rename, move top/bottom, remove (undo toast, no confirm dialog).
 * "Change captains" is dropped (single-team rows have nothing to swap) and
 * replay lives on finished matches in HistoryScreen, not here. Screen-level
 * composition: talks to SessionActions directly (design.md §5) for rename
 * and remove. Move-to-top/bottom are requested via onRequestMoveTop/
 * onRequestMoveBottom instead — QueueList owns the confirmation dialog and
 * the real moveTop/moveBottom call, since it already has the queue order
 * this sheet doesn't (docs/superpowers/specs/2026-07-15-move-end-confirm-
 * design.md).
 */
export interface QueueActionsSheetProps {
  open: boolean
  onClose: () => void
  entry: QueueEntryView
  onRequestMoveTop: () => void
  onRequestMoveBottom: () => void
  onError?: (message: string) => void
}

export function QueueActionsSheet({
  open,
  onClose,
  entry,
  onRequestMoveTop,
  onRequestMoveBottom,
  onError,
}: QueueActionsSheetProps) {
  const actions = useSessionActions()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(entry.team.name)

  useEffect(() => {
    setName(entry.team.name)
  }, [entry.team.id, entry.team.name])

  function reportError(): void {
    onError?.(t('queue.actions.error'))
  }

  async function handleRenameBlur(): Promise<void> {
    setRenaming(false)
    const trimmed = name.trim()
    if (!trimmed || trimmed === entry.team.name) return
    try {
      await actions.updateTeam(entry.team.id, { name: trimmed })
    } catch {
      reportError()
    }
  }

  function handleMoveTop(): void {
    onClose()
    onRequestMoveTop()
  }

  function handleMoveBottom(): void {
    onClose()
    onRequestMoveBottom()
  }

  async function handleRemove(): Promise<void> {
    try {
      const { activityId } = await actions.removeFromLine(entry.id)
      onClose()
      showUndoToast('toast.removedFromQueue', () => {
        void actions.undo(activityId)
      })
    } catch {
      reportError()
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={entry.team.name}>
      <div className="flex flex-col gap-1">
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void handleRenameBlur()}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="min-h-[var(--touch-target-min)] rounded-xl border border-line bg-surface-2 px-3 text-[16px] text-ink outline-none"
          />
        ) : (
          <>
            <SheetAction label={t('queue.actions.rename')} onClick={() => setRenaming(true)} />
            <SheetAction label={t('queue.actions.moveTop')} onClick={handleMoveTop} />
            <SheetAction label={t('queue.actions.moveBottom')} onClick={handleMoveBottom} />
            <SheetAction label={t('queue.remove')} danger onClick={() => void handleRemove()} />
          </>
        )}
      </div>
    </Sheet>
  )
}

function SheetAction({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[var(--touch-target-min)] items-center rounded-xl px-3 text-start text-[16px] font-semibold',
        danger ? 'text-danger' : 'text-ink',
      )}
    >
      {label}
    </button>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run src/components/QueueActionsSheet.test.tsx`
Expected: PASS (all 8 tests — the 6 pre-existing untouched ones plus the 2 rewritten ones).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/QueueActionsSheet.tsx apps/web/src/components/QueueActionsSheet.test.tsx
git commit -m "feat(web): request move-to-top/bottom instead of committing directly"
```

---

### Task 2: `QueueList` — gate move-to-top/bottom behind confirmation

**Files:**
- Modify: `apps/web/src/components/QueueList.tsx`
- Modify: `apps/web/src/components/QueueList.test.tsx`

**Interfaces:**
- Consumes: `planRowSwitch` (already imported in this file from Task 1 of the row-switch-confirm plan) from `@/lib/queue-pairing`; `QueueActionsSheetProps`'s new `onRequestMoveTop`/`onRequestMoveBottom` fields (Task 1 of this plan) from `@/components/QueueActionsSheet`.
- Produces: nothing new for further tasks — Task 3 is verification only.

This task is fully unit-testable with ordinary `fireEvent.click` — unlike the row-drag feature's `handleDragEnd` wiring, nothing here depends on dnd-kit's sensor pipeline.

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to the end of `apps/web/src/components/QueueList.test.tsx`, before the final closing `})` of the outer `describe('QueueList', ...)`:

```tsx
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

    it('shows a team-count title for a multi-slot move to bottom, and only calls moveBottom after confirming', () => {
      const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2), entry('e3', 'ג', 3), entry('e4', 'ד', 4)]
      const { actions } = renderQueueList(queue)
      openMenuFor('א')
      fireEvent.click(screen.getByText('לסוף התור'))

      expect(screen.getByText('להזיז את א למטה? (עוד 3 קבוצות יזוזו מקום)')).toBeDefined()
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/QueueList.test.tsx`
Expected: FAIL — `QueueActionsSheet` doesn't yet receive `onRequestMoveTop`/`onRequestMoveBottom` from `QueueList`, so a TypeScript error surfaces at the existing render call site, and none of the new dialog text/behavior exists yet.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/src/components/QueueList.tsx`, add this interface immediately after the existing `PendingRowSwitch` interface (after its closing `}`, i.e. after line 88 as the file stands before this task):

```ts
interface PendingMoveEnd {
  entryId: string
  end: 'top' | 'bottom'
  direction: 'up' | 'down'
  groupANames: string[]
  occupantNames: string[] | null
  shiftCount: number
}
```

Add a new state declaration immediately after the existing `pendingRowSwitch` state:

```ts
  const [pendingMoveEnd, setPendingMoveEnd] = useState<PendingMoveEnd | null>(null)
```

Add these three new handler functions immediately after `handleCancelRowSwitch` (i.e. after its closing `}`, right before the `const reflow = ...` line):

```ts
  function handleRequestMoveEnd(entryId: string, end: 'top' | 'bottom'): void {
    const oldIndex = orderIds.indexOf(entryId)
    const newIndex = end === 'top' ? 0 : orderIds.length - 1
    const plan = planRowSwitch(orderIds, oldIndex, newIndex)
    if (!plan) return
    setPendingMoveEnd({
      entryId,
      end,
      direction: plan.direction,
      groupANames: namesOf({ entryIds: [plan.movedId] }, byId),
      occupantNames: plan.occupantId ? namesOf({ entryIds: [plan.occupantId] }, byId) : null,
      shiftCount: plan.shiftCount,
    })
  }

  function handleConfirmMoveEnd(): void {
    const pending = pendingMoveEnd
    if (!pending) return
    setPendingMoveEnd(null)
    const move = pending.end === 'top' ? actions.moveTop : actions.moveBottom
    move(pending.entryId).catch(() => {
      onError?.(t('queue.actions.error'))
    })
  }

  function handleCancelMoveEnd(): void {
    setPendingMoveEnd(null)
  }
```

Update the existing `QueueActionsSheet` render call (currently the single line `{menuEntry && <QueueActionsSheet open onClose={() => setMenuEntryId(null)} entry={menuEntry} {...(onError ? { onError } : {})} />}`) to pass the two new required props:

```tsx
      {menuEntry && (
        <QueueActionsSheet
          open
          onClose={() => setMenuEntryId(null)}
          entry={menuEntry}
          onRequestMoveTop={() => handleRequestMoveEnd(menuEntry.id, 'top')}
          onRequestMoveBottom={() => handleRequestMoveEnd(menuEntry.id, 'bottom')}
          {...(onError ? { onError } : {})}
        />
      )}
```

Add a new, independent conditional render immediately after it (still inside the outer `<>...</>` fragment, alongside the existing `{pendingSwitch && ...}` and `{pendingRowSwitch && ...}` blocks):

```tsx
      {pendingMoveEnd && (
        <PairSwitchConfirmDialog
          open
          unit="team"
          onConfirm={handleConfirmMoveEnd}
          onCancel={handleCancelMoveEnd}
          groupANames={pendingMoveEnd.groupANames}
          direction={pendingMoveEnd.direction}
          occupantNames={pendingMoveEnd.occupantNames}
          shiftCount={pendingMoveEnd.shiftCount}
        />
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run src/components/QueueList.test.tsx`
Expected: PASS (every existing test plus the 4 new ones in `describe('move-to-top/bottom confirmation', ...)`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/QueueList.tsx apps/web/src/components/QueueList.test.tsx
git commit -m "feat(web): confirm move-to-top/bottom before applying them"
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

Run `pnpm dev` (or `cd apps/web && VITE_DEMO=1 pnpm dev`), open the app with an active session and at least 4 queue entries, and check:

- Tapping ⋯ on a row, then "לראש התור" (or "לסוף התור") closes the sheet immediately and opens the confirmation dialog in the same motion — no visible flash of both being open, no leftover sheet backdrop.
- The dialog's wording matches the row-drag's: adjacent moves name both entries ("להחליף בין X ⇄ Y?"), farther moves show a count ("להזיז את X למטה/למעלה? (עוד N קבוצות יזוזו מקום)").
- Tapping אישור actually applies the move once the next realtime snapshot arrives (may take a beat, since there's no local optimistic preview for this flow, unlike the drags).
- Tapping ביטול closes the dialog and changes nothing.
- Requesting a move when the entry is already at that extreme (e.g. tapping "לראש התור" on the first entry) does nothing — no sheet-close flash into an empty dialog, no server call.
- Escape and overlay-click on the confirmation dialog behave like Cancel (reuses `Dialog`'s existing `onClose`/focus-trap wiring, unchanged by this plan).
- Both drag mechanisms (pair-grip ⋮⋮ and per-row ☰) still behave exactly as before this task.

- [ ] **Step 3: Update the plan's status**

Mark all tasks above complete. No separate commit needed — this task only verifies work already committed in Tasks 1–2.

## Self-Review

**Spec coverage:** ownership lifted to `QueueList` (Task 1's prop change + Task 2's handlers) — no optimistic state, direct confirm/cancel (Task 2's `handleConfirmMoveEnd`/`handleCancelMoveEnd`) — `planRowSwitch` reused unchanged for display info only (Task 2's `handleRequestMoveEnd`) — sheet/dialog never coexist (Task 1's `handleMoveTop`/`handleMoveBottom` calling `onClose()` synchronously alongside the request, batched by React) — no undo toast (nothing added; `handleRemove`'s untouched) — every section of `docs/superpowers/specs/2026-07-15-move-end-confirm-design.md` has a task.

**Placeholder scan:** none — every step has complete, runnable code.

**Type consistency:** `PendingMoveEnd`'s fields (`entryId`, `end`, `direction`, `groupANames`, `occupantNames`, `shiftCount`) match between Task 2's definition and its own `handleRequestMoveEnd`/`handleConfirmMoveEnd`/JSX usage. `QueueActionsSheetProps`'s new `onRequestMoveTop`/`onRequestMoveBottom` fields (Task 1) match exactly at Task 2's call site. `namesOf`/`planRowSwitch` (already defined before this plan) are reused unchanged, no new helpers duplicated.
