# Always name a specific swap partner

**Status:** approved
**Date:** 2026-07-15

## Problem

The three reorder-confirmation dialogs built earlier today
(`docs/superpowers/specs/2026-07-15-pair-switch-confirm-design.md`,
`docs/superpowers/specs/2026-07-15-row-switch-confirm-design.md`,
`docs/superpowers/specs/2026-07-15-move-end-confirm-design.md`, all sharing
`apps/web/src/components/PairSwitchConfirmDialog.tsx`) name both affected entities only for an
adjacent (magnitude-1) move — "להחליף בין X ⇄ Y?". A farther move instead states a count —
"להזיז את X למטה? (עוד N קבוצות יזוזו מקום)" — because the original design reasoned that naming
only one of several displaced entities would misrepresent how many actually move.

Looking at the real dialog in the running app, the user rejected the count-only wording: they want
every move, regardless of distance, to read as "מחליף מקום בין X ל-Y?" (switching places between X
and Y) — always two specific names, never a bare count.

## Chosen approach

### 1. The universal occupant rule

For any move — single-entry (`planRowSwitch`) or pair-group (`reorderGroups`) — the entity that
ends up in the mover's exact original slot is always the **original array's immediate neighbor in
the direction of the move**:

```
occupant = direction === 'down' ? array[oldIndex + 1] : array[oldIndex - 1]
```

This holds for any magnitude, not just 1 — verified by hand for a magnitude-3 move in both
directions (e.g. `['A','B','C','D','E']`, moving `A` from index 0 to index 3 yields
`['B','C','D','A','E']`; `B` — `array[oldIndex + 1]` — is exactly the entity now at index 0, `A`'s
old slot). It is always in-bounds whenever a real move happens: moving down requires
`oldIndex < array.length - 1` (so `oldIndex + 1` is always valid), moving up requires
`oldIndex ≥ 1` (so `oldIndex - 1` is always valid). So the occupant is never absent — no more
magnitude branch, no more `null` case.

This is a simplification of the existing pair-group math, not just a new rule: `onDragEnd`'s
current occupant lookup builds a filtered `remaining` array (excluding the dragged group) and
branches on `toIndex - 1` vs `toIndex` in that filtered space, purely as an artifact of computing
`toIndex` from post-removal sibling rects. The universal rule needs none of that — it reads
`pairGroups[fromIndex + 1]` or `pairGroups[fromIndex - 1]` directly from the array `QueueList`
already has, before any removal.

`direction` is only ever used, in the current code, to (a) pick `oldIndex ± 1`, and (b) pick which
count-wording i18n key to show. (b) goes away with this change, and (a) can stay a local detail
inside whichever function computes the occupant — no caller reads `direction` for anything else
(`handleCancelSwitch`/`handleCancelRowSwitch`/`handleCancelMoveEnd` all use their own
`dragFromIndexRef`/`previousOrder`, never a pending state's `direction`). So `planRowSwitch`'s
return type drops `direction` and `shiftCount` entirely — not just from the dialog's props, from
its own signature: `RowSwitchPlan` becomes `{ fromIndex, toIndex, movedId, occupantId }`, with
`occupantId` now non-nullable (a real string, not `string | null`) since the occupant always
exists.

### 2. `PairSwitchConfirmDialog` shrinks to match

Since every case now renders the same "switching places" template — which never mentioned a noun
or a count — the following become dead weight and are removed:

- `unit: 'pair' | 'team'` prop — no longer needed; there's only one template.
- `shiftCount: number` prop — no longer displayed anywhere.
- `occupantNames: string[] | null` — becomes `occupantNames: string[]`, always required. A future
  caller can no longer forget to compute an occupant and silently fall back to a count wording
  that no longer exists.
- `direction: 'up' | 'down'` prop — the dialog itself never needed direction for anything except
  picking which count-wording key to use. It stays as an *internal* detail computed by
  `planRowSwitch` and the pair-group equivalent (to choose `oldIndex + 1` vs `oldIndex - 1`), but
  stops being threaded through `PendingSwitch`/`PendingRowSwitch`/`PendingMoveEnd` or the dialog's
  props, since nothing downstream of those needs it anymore.
- Four i18n keys become unreachable and are deleted: `queue.pairSwitch.confirmMultiUp`,
  `queue.pairSwitch.confirmMultiDown`, `queue.rowSwitch.confirmMultiUp`,
  `queue.rowSwitch.confirmMultiDown`.

### 3. One surviving i18n key gets renamed, not just reused

`queue.pairSwitch.confirmAdjacent` ("להחליף בין {groupA} ⇄ {groupB}?") is the only template left,
but its name is now a misnomer — it renders for every move, not just adjacent ones. Renamed to
`queue.pairSwitch.confirmSwap`, same Hebrew text. `queue.pairSwitch.confirm`/`queue.pairSwitch
.cancel` (button labels) are untouched.

The component file itself keeps its name, `PairSwitchConfirmDialog` — renaming it would touch
every call site and its test file for a cosmetic gain only, the same "avoid unnecessary churn"
call already made once today when the `unit` prop was added.

## Scope and git handling

Touches all three already-implemented flows in `QueueList.tsx` (pair-grip drag, per-row drag,
move-to-top/bottom) plus `PairSwitchConfirmDialog.tsx`/`.test.tsx` and `he.json`. Two of the three
underlying features (pair-switch-confirm, row-switch-confirm) are already pushed to
`origin/main`; this correction lands as new commit(s) on top, exactly like every other change
today — no rebase, no amend, no force-push.

## Testing

- `PairSwitchConfirmDialog.test.tsx`: every existing multi-count test (`unit="pair"`/`unit="team"`
  variants) is replaced with a test asserting the swap-style wording for a multi-slot scenario;
  every existing adjacent-swap test drops its now-removed `unit`/`shiftCount`/`direction` args.
- `QueueList.test.tsx`: the three flows' existing "shows a team/pair-count title for a multi-slot
  move" tests are rewritten to assert the swap-style wording naming the correct occupant (the
  original array's immediate neighbor in the move direction) instead of a count.
