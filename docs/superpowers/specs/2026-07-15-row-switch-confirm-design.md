# Single-row drag confirmation dialog

**Status:** approved
**Date:** 2026-07-15

## Problem

`docs/superpowers/specs/2026-07-15-pair-switch-confirm-design.md` gated the pair-group drag
(the ⋮⋮ grip, double-tap-and-hold-then-drag) behind a confirmation dialog. But `QueueList` has a
second, older, independent drag mechanism — the ☰ handle on an individual `QueueRow`, powered by
dnd-kit (`handleDragEnd`) — that moves a single queue entry and still applies immediately with no
confirmation and no undo toast. A user testing the new pair-drag confirmation assumed it covered
"switching pairs" in general, dragged a row via ☰ instead, and got no confirmation — not a bug
(that path was always out of scope for the pair-drag work), but a real gap: the ☰ handle is a
single continuous drag with no double-tap-and-hold gate, so it's *easier* to trigger by accident
than the pair-drag ever was, and it can just as easily change who's predicted to play whom (pairs
are just "every two consecutive queue entries").

## Chosen approach

### 1. Scope: every row drag is gated, no exceptions

Considered gating only drags that cross a pair boundary (change an existing pair-vs-pair
matchup) and letting within-pair or unpaired-tail reorders apply instantly. Rejected: the user
explicitly chose maximal protection — every row drag shows a confirmation, including a same-pair
position swap or two solo/unpaired tail entries reordering among themselves — over minimizing
friction on the single most frequent interaction on this screen. This is a deliberate trade
already discussed and decided, not an oversight.

### 2. Mechanism: optimistic-apply-and-defer, no custom freeze needed

Unlike the pair-drag (a hand-rolled pointer-tracked gesture that needed an explicit "freeze the
DOM state" step because there's no built-in commit boundary), dnd-kit's `handleDragEnd` already
receives the final `active`/`over` ids directly — there is no live pointer state to freeze.

`handleDragEnd` keeps computing `next = arrayMove(orderIds, oldIndex, newIndex)` and calling
`setOrderIds(next)` immediately, exactly as it does today — this is what makes dnd-kit animate
the row into its dropped position, and is left unchanged. What changes: `actions.reorderLine(next)`
is no longer called from here. Instead, a `pendingRowSwitch` state is set (mirroring
`pendingSwitch` from the pair-drag) and a confirmation dialog renders gated on it.

- **Confirm:** call `actions.reorderLine(next)` — revert `orderIds` and call `onError` on
  rejection, identical to every other reorder-failure path in this file — then clear
  `pendingRowSwitch`.
- **Cancel:** `setOrderIds(previous)` and clear `pendingRowSwitch`. dnd-kit animates the row back
  to its original position on its own, driven by the same `orderIds`-in-`SortableContext`
  mechanism that animates every drag today — no manual animation code needed, unlike the
  pair-drag's hand-rolled cancel-and-snap-back.

### 3. Magnitude/occupant math — simpler than the pair-drag's

Working through `arrayMove`'s splice-remove-then-insert mechanics (dnd-kit's `arrayMove` has the
same shape as `reorderGroups`): moving an entry by *N* slots displaces exactly *N* other entries
by one slot each — same invariant as the pair-drag. But here, `newIndex` (from
`orderIds.indexOf(over.id)`) is always in the pre-removal, original-array index space, and working
through concrete examples in both directions confirms the magnitude-1 occupant is always simply
*whatever entry sits at `newIndex` before the move* — no up/down branching required. (The pair-drag
needed `toIndex - 1` vs `toIndex` branching only because its own `toIndex` came from
`indexForPointerY` against a post-removal "remaining" index space — an artifact of that gesture's
implementation, not something inherent to the swap math itself.)

- **Magnitude 1:** genuine two-way swap — occupant = `byId.get(orderIds[newIndex])` (before the
  move). Dialog names both entries.
- **Magnitude >1:** occupant is `null`, dialog states the count instead — same reasoning as the
  pair-drag: naming only one displaced entry would misrepresent how many actually move.

### 4. `PairSwitchConfirmDialog` gains a `unit` prop instead of a new component

The adjacent-swap phrasing (`queue.pairSwitch.confirmAdjacent`, "להחליף בין {groupA} ⇄ {groupB}?")
never mentions "pairs" — it's reused as-is for single-row swaps. Only the multi-shift count
message names a noun ("זוגות"), which is wrong for a single-team shift ("קבוצות"). So the
component gains a `unit: 'pair' | 'team'` prop:

```ts
export interface PairSwitchConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  groupANames: string[]
  direction: 'up' | 'down'
  occupantNames: string[] | null
  shiftCount: number
  unit: 'pair' | 'team'          // new — selects which multi-shift i18n keys to use
}
```

`unit === 'pair'` uses the existing `queue.pairSwitch.confirmMultiUp/Down` keys unchanged.
`unit === 'team'` uses two new keys:

- `queue.rowSwitch.confirmMultiDown` → `"להזיז את {groupA} למטה? (עוד {count} קבוצות יזוזו מקום)"`
- `queue.rowSwitch.confirmMultiUp` → `"להזיז את {groupA} למעלה? (עוד {count} קבוצות יזוזו מקום)"`

`groupANames`/`occupantNames` are 1-element arrays for a row move (`.join(' / ')` on a single
name is just that name — no special-casing needed). The component itself, its file name, and its
existing tests are otherwise unchanged; this is an additive prop, not a rewrite.

## Edge cases

- **Drop at the original position:** unchanged — `handleDragEnd`'s existing
  `active.id === over.id` check already no-ops before any of this new logic runs.
- **The trailing solo (unpaired) entry:** has no pair-drag grip, but its row still has the ☰
  handle like any other row — it is gated exactly like every other row drag, per the "no
  exceptions" scope decision.
- **`reorderLine` rejects after Confirm:** revert `orderIds`, surface `queue.actions.error` via
  `onError` — identical to the existing per-row-drag error path and the pair-drag's Confirm path.

## Testing

- `PairSwitchConfirmDialog.test.tsx`: add cases for `unit: 'team'` producing the
  `queue.rowSwitch.confirmMulti*` copy (mirroring the existing `unit: 'pair'` multi-shift tests);
  existing tests gain an explicit `unit="pair"` prop and must keep passing unchanged.
- `QueueList.test.tsx`: new tests for the row-drag path — dropping via dnd-kit's `handleDragEnd`
  opens a confirmation instead of calling `reorderLine` immediately; `reorderLine` is called only
  after Confirm, with the correct `arrayMove` result; Cancel restores the original order via
  `setOrderIds` with `reorderLine` never called; a magnitude-1 row drop names both entries via the
  adjacent copy; a magnitude->1 row drop shows the team-count copy.
