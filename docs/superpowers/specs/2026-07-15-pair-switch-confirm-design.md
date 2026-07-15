# Pair-move confirmation dialog

**Status:** approved
**Date:** 2026-07-15

## Problem

`QueueList`'s pair drag-and-drop (`docs/superpowers/specs/2026-07-13-queue-pair-move-design.md`,
`docs/superpowers/specs/2026-07-13-queue-pair-drag-live-reflow-design.md`) currently applies a
pair move optimistically on drop and shows an undo toast. Staff running the line are largely
non-technical, work fast, and a reorder can touch several pairs' positions at once — the request
is to gate the drop behind an explicit confirmation naming what's about to change, rather than
relying on staff to notice something's wrong and reach for undo after the fact.

This is a deliberate, scoped exception to the project's "no blocking popups in live flows" rule
(`CLAUDE.md`), same as the existing rematch confirmation
(`apps/web/src/components/RematchConfirmDialog.tsx`) — justified here because the existing
undo-toast safety net is being replaced, not supplemented, so the confirm has to actually hold the
line.

## Why a blocking dialog here, not just a louder toast

Three things already make an accidental pair move unlikely to reach this point at all: the
trigger gesture requires a double-tap **and** a ~380ms hold **and** a drag (docs/superpowers/specs/
2026-07-13-queue-pair-move-design.md) — casual taps/scrolling can't set it off — and once dragging,
the live reflow gives a full visual preview of the result before the pointer is even released.
Given those, a blocking dialog only earns its keep if its wording is trustworthy; a misleading
confirmation is worse than no confirmation, because staff act on what it tells them. That
constraint drove the wording rule below.

## Chosen approach

### 1. The distance rule (why the copy differs by move size)

`reorderGroups` (`apps/web/src/lib/queue-pairing.ts`) moves the dragged pair from `fromIndex` to
`toIndex` by splice-remove-then-insert. Working through the array mechanics: moving a pair by *N*
slots always displaces exactly *N* other pairs by one slot each, in the same direction — this is
exact, not approximate, for any `fromIndex`/`toIndex` pair.

- **N = 1** (adjacent move): exactly one other pair is displaced, and it swaps places with the
  dragged pair — a literal two-way swap. Naming both pairs is fully accurate.
- **N > 1**: multiple pairs shift. Naming only the pair that ends up at the exact drop slot would
  imply just two pairs are affected when the true effect is broader — this is the misleading
  framing this design explicitly avoids. The copy states the count instead.

There is no separate "moved to the end, no occupant" case — landing past the last pair is just
another N > 1 (or N = 1, if there's exactly one other pair) move; the count-based copy already
covers it.

`magnitude = Math.abs(toIndex - fromIndex)`, using the same `fromIndex`/`toIndex` values already
computed today (`dragFromIndexRef`, `dragOverIndexRef` — `toIndex` in the post-removal index space
`indexForPointerY`/`reorderGroups` already operate in). `direction` reuses the existing rule
(`toIndex < fromIndex` → `'up'`, else `'down'`) already present in today's undo-toast message-key
logic.

### 2. `PairSwitchConfirmDialog` component

New component, same `Dialog`/`Button` primitives as `RematchConfirmDialog` but **without** its
`submitting`/inline-error state: rematch needs that because confirming is the *first* thing that
happens (no optimistic preview exists yet). Here, `QueueList` already applies every reorder
optimistically and reverts-with-`onError` on failure (its plain single-row drag does this today
with no dialog involved at all) — so Confirm just closes the dialog immediately and lets that
existing background apply/revert path run, same as it does for every other reorder in this file.

```ts
interface PairSwitchConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  groupANames: string[]           // dragged pair's team names, e.g. ["יוסי", "רון"]
  direction: 'up' | 'down'
  occupantNames: string[] | null  // the one displaced pair's names — only when magnitude === 1
  shiftCount: number              // magnitude — used only when occupantNames is null
}
```

New i18n keys (`apps/web/src/i18n/he.json`), direction baked into the key rather than interpolated
as a translated fragment (matches repo i18n convention — no sentence built from spliced pieces):

- `queue.pairSwitch.confirmAdjacent` → `"להחליף בין {groupA} ⇄ {groupB}?"`
- `queue.pairSwitch.confirmMultiDown` → `"להזיז את {groupA} למטה? (עוד {count} זוגות יזוזו מקום)"`
- `queue.pairSwitch.confirmMultiUp` → `"להזיז את {groupA} למעלה? (עוד {count} זוגות יזוזו מקום)"`
- `queue.pairSwitch.confirm` → `"אישור"`
- `queue.pairSwitch.cancel` → `"ביטול"`

`groupANames`/`occupantNames` are joined with `" / "` before interpolation (e.g. `"יוסי / רון"`).

### 3. `QueueList` wiring

Replaces the current `onDragEnd`'s "apply immediately + `showUndoToast`" behavior
(`apps/web/src/components/QueueList.tsx`):

- **On pointer-up:** stop live pointer tracking (remove the `pointermove`/`pointerup` listeners)
  but do **not** clear `dragGroupId`/`dragOverIndex`/`dragRectsRef` — they freeze exactly as they
  were at release, so the floating card and the live-reflow gap stay visible at the drop target
  while the dialog is open. Compute `fromIndex`/`toIndex`/magnitude/occupant from those frozen
  refs into a new `pendingSwitch` state and render `PairSwitchConfirmDialog open={pendingSwitch !==
  null}` with the derived props.
- **Confirm:** clear all drag/`pendingSwitch` state immediately (closing the dialog synchronously —
  no submitting spinner), then `setOrderIds(nextOrder)` and call `actions.reorderLine(nextOrder)` in
  the background — on rejection, revert `orderIds` and call `onError`, exactly the same
  apply-then-revert-on-failure pattern this file already uses for its plain single-row drag, just
  with no undo toast (the confirm already gated the action). The frozen visual already matches
  `nextOrder`, so nothing needs to animate on success; clearing state just hands rendering back to
  the (now-reordered) list, which looks identical to the frozen overlay.
- **Cancel:** clear `pendingSwitch`, then animate back to the original layout — set `dragOverIndex`
  back to `dragFromIndex` (reuses the existing reflow CSS transition already used during live drag)
  and give the floating card's transform a transition before resetting it to `translateY(0)`; clear
  `dragGroupId`/the drag refs after that transition completes (~150ms, matching the existing reflow
  transition duration).

### 4. Removed as orphans of this change

`QueueList.tsx`'s `showUndoToast` call and its two i18n keys (`toast.pairMovedUp`,
`toast.pairMovedDown`) are removed — `showUndoToast` itself and `UndoToast.tsx` stay, since
`QueueActionsSheet.tsx` still uses it for remove-from-queue.

## Edge cases

- **Solo (odd, unpaired) trailing entry:** unaffected — the grip handle already only renders for
  non-solo groups (`variant !== 'solo'`), so `groupANames` (the dragged side) is always a real
  2-team pair. The *occupant* side can legitimately be the solo entry's single name (1 entry) if
  it's the one displaced — the dialog just joins whatever names it's given, no special-casing.
- **Drop back at the original position** (`fromIndex === toIndex`): no dialog, no API call — same
  as today's no-op behavior.
- **`reorderLine` rejects after Confirm:** revert `orderIds`, surface the existing
  `queue.actions.error` via `onError` — unchanged from today's error path, just reached from the
  confirm handler instead of the immediate-apply handler.

## Testing

- `PairSwitchConfirmDialog.test.tsx`: closed renders nothing; adjacent-move title text; multi-move
  (up and down) title text with count; confirm calls `onConfirm` once and not before tapped; cancel
  calls `onCancel` without ever calling `onConfirm`.
- `QueueList.test.tsx`: replace the existing "drags the front pair past the middle pair and
  reorders on drop" assertions (currently asserting `reorderLine` is called immediately) with:
  dropping opens the dialog instead of calling `reorderLine`; `reorderLine` is called only after
  Confirm, with the correct `nextOrder`; Cancel restores the original order with `reorderLine`
  never called; the frozen drag visual (placeholder gap position, `dragGroupId`) persists across
  the pointer-up-to-dialog-open transition.
