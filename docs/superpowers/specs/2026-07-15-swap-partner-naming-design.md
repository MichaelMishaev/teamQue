# Always name a specific swap partner

**Status:** superseded by "always name every displaced entity" below
**Date:** 2026-07-15

## Always name every displaced entity, not a count (2026-07-15, latest)

After reverting to the pre-feature count wording (section immediately below), user feedback on the
reverted dialog was explicit: staff want to see *who* moves, not how many — "עוד 2 קבוצות יזוזו מקום"
doesn't tell them anything actionable. Checked shipped reorder UIs again for this specific
question — none of them show a bare count either; the ones with any per-action copy at all
(Peloton's "Reorder blocks" confirm) list the actual items.

Kept the revert's core call (shift semantics stay — no change to `arrayMove`/`reorderGroups`/
`computeReflow`), but replaced the count fallback with a full name list: `planRowSwitch`'s
`occupantId: string | null` became `displacedIds: string[]` (every entry between `fromIndex` and
`toIndex`, always at least one — no more magnitude branch inside the function itself), and the new
`displacedGroups(groups, fromIndex, toIndex)` is the pair-group analogue. `PairSwitchConfirmDialog`
takes `displaced: string[][]` — one inner array per displaced *entity* (1 name for a solo row, up to
2 for a pair) — rather than a flat name list, because flattening would conflate "one pair displaced
(2 names)" with "two solo rows displaced (2 names)": the two-way "⇄" phrasing only fires when exactly
one *entity* moved, which `displaced.length === 1` now answers unambiguously regardless of how many
names that one entity contributes. `queue.rowSwitch.confirmMulti{Up,Down}` are deleted (the `unit`
prop is gone — nothing left that varies by "pairs" vs "teams" once every name is listed explicitly);
`queue.pairSwitch.confirmMulti{Up,Down}` take a `{names}` param (comma-joined, groups joined by " / ")
instead of `{count}`.

The `CLAUDE.md` "no blocking popups, use undo toasts" tension noted in the section below is still
unresolved and still out of scope here.

## Final correction (2026-07-15, later still) — reverted the whole "always name two" direction

A real multi-slot row drag (dragging a solo tail entry up two pair-slots) surfaced that this
design's core premise was wrong: the dialog said "מחליף מקום בין טל ל-נדב?" (switching places
between Tal and Nadav — naming only two entities), but the applied reorder (`arrayMove` /
`reorderGroups`, unchanged by this whole feature) is a shift — it displaces every entry between the
two positions by one slot each, not just the two named ones. A third entry (רון) moved without ever
being mentioned in the dialog. The "correction" immediately below (fixing *which* entity gets named)
made the naming accurate for what a shift-based reorder actually does at magnitude 1, but did nothing
for magnitude > 1, where the mismatch is structural, not a naming bug.

Two ways to close that gap: make the reorder a genuine two-entry swap (leave everyone else in
place), or make the dialog accurately describe a shift again. Checked shipped reorder UIs (Peloton,
SiriusXM, Todoist, Pinterest, Attio, Beli, Waterllama via Mobbin) — every one of them shifts, none of
them swap-only; a swap-only drag has no precedent in real products and would fight the existing
live-reflow drag animation (`computeReflow`), which already previews a shift and is covered by an
explicit invariant test asserting it matches `reorderGroups`. Separately, `CLAUDE.md`'s hard UX rule
— "no blocking popups in live flows, use undo toasts" — is already in tension with this feature's own
per-drag blocking dialog, independent of this bug; not resolved here, flagged for a future decision.

Given both, this entire feature (this doc, `feat(web): always name planRowSwitch's occupant, any
move distance`, `feat(web): simplify PairSwitchConfirmDialog to always name a swap partner`,
`feat(web): wire the universal swap-partner rule into all three reorder flows`, and the correction
below) is reverted. `planRowSwitch`, `PairSwitchConfirmDialog`, the pair-grip `onDragEnd` occupant
math, and `he.json` are restored to their state as of `778d24b` (before this feature started):
magnitude-1 moves name both entities (`queue.pairSwitch.confirmAdjacent`), magnitude>1 moves state a
count (`confirmMulti{Up,Down}` × pair/team) instead of naming a bystander. The two sections below are
kept as historical record; do not re-derive occupant or reorder logic from either of them.

## Correction (2026-07-15, later) — superseded by the final correction above

A real multi-slot drag in the running app surfaced that the "universal occupant rule" in §1 below
picks the wrong entity: `array[oldIndex ± 1]` names whoever backfills the mover's *old* slot, not
whoever the user actually dropped onto. For a 1-slot move those are the same entry, so this passed
manual testing; for a multi-slot move (e.g. dragging a group past two others) the dialog named a
bystander instead of the entity that visually swapped places with the mover.

The rule is corrected to: **`occupant = array[toIndex]`** (the pre-move entity sitting at the drop
target), read directly from the same pre-move array — no `direction` branch needed. This changes
`planRowSwitch` (`apps/web/src/lib/queue-pairing.ts`) and the pair-grip `onDragEnd` handler
(`apps/web/src/components/QueueList.tsx`) only; `PairSwitchConfirmDialog`'s props and the
`queue.pairSwitch.confirmSwap` i18n key are unaffected. §1 below is kept as-is for the historical
record of what was actually built and superseded; do not re-derive occupant logic from it.

## Original decision (superseded — see correction above)

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
