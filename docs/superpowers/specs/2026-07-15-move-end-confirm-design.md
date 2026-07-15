# Move-to-top/bottom confirmation dialog

**Status:** approved
**Date:** 2026-07-15

## Problem

`docs/superpowers/specs/2026-07-15-pair-switch-confirm-design.md` and
`docs/superpowers/specs/2026-07-15-row-switch-confirm-design.md` gated `QueueList`'s two drag
mechanisms (the pair-group ⋮⋮ grip and the per-row ☰ handle) behind a confirmation dialog. But
`QueueActionsSheet`'s ⋯-menu "לראש התור" (move to top) / "לסוף התור" (move to bottom) buttons — a
third way to reorder the queue — still commit immediately via `actions.moveTop`/`moveBottom`, with
no confirmation and (unlike the sheet's own "Remove" button right next to them) no undo toast
either. The final whole-branch review of the row-drag feature surfaced this as the direct answer
to "is there a third unprotected reorder mechanism": there is, and it can change who's predicted to
play whom just as much as either drag.

## Chosen approach

### 1. Same protection, deliberately, even though the trigger is different

A drag can happen by accident (a continuous gesture); reaching `moveTop`/`moveBottom` cannot —
it takes two deliberate taps (open ⋯, then tap a button explicitly labeled "move to top/bottom").
So the risk here isn't "did I do this without meaning to," it's "do I realize this changes who
plays whom." Given that different risk profile, a louder undo toast (matching `handleRemove`'s
existing pattern in the same sheet) was a real, considered alternative. The user chose the same
blocking confirmation as both drags anyway, for the same reason as before: consistency of maximal
protection over minimizing taps.

### 2. Ownership moves to `QueueList`; `QueueActionsSheet` becomes dumb

`actions.moveTop(entryId)`/`moveBottom(entryId)` are server-authoritative — the server decides the
resulting order, and today the client does no local reordering before or after the call (unlike
both drag flows, which compute a `nextOrder` array locally). `QueueActionsSheet` only receives the
single tapped `entry`, not the full queue/order, so it can't compute a swap plan on its own without
a much wider prop surface.

Chosen instead: `QueueActionsSheet` gains two new props, `onRequestMoveTop: () => void` and
`onRequestMoveBottom: () => void`, replacing its direct `actions.moveTop`/`moveBottom` calls and
their try/catch. Tapping either button now just calls the prop and closes the sheet immediately —
`QueueList` (which already owns `orderIds`/`byId` for the other two flows) computes the plan, shows
the dialog, and makes the real server call on confirm. This mirrors the existing
`pendingSwitch`/`pendingRowSwitch` ownership pattern rather than introducing a third shape.

### 3. No optimistic local state needed — simpler than both drag flows

Because `moveTop`/`moveBottom` never apply anything locally today (the UI only updates once a
fresh realtime snapshot arrives reflecting the server's new order), the new flow doesn't need a
`previousOrder`/`nextOrder` pair or any revert-on-failure re-apply:

- **Confirm:** call `actions.moveTop(entryId)` or `actions.moveBottom(entryId)` directly — on
  rejection, surface `queue.actions.error` via `onError`, identical to today's `reportError()` —
  then clear the pending state. The UI updates whenever the broadcast arrives, exactly as it does
  today; there is nothing to revert because nothing was applied optimistically.
- **Cancel:** clear the pending state. Nothing to revert.

### 4. `planRowSwitch` is reused unchanged, purely for the dialog's display info

`QueueList` computes `oldIndex = orderIds.indexOf(entryId)` and `newIndex = end === 'top' ? 0 :
orderIds.length - 1`, then calls the existing `planRowSwitch(orderIds, oldIndex, newIndex)` from
`docs/superpowers/specs/2026-07-15-row-switch-confirm-design.md` — no changes to that function.

- If it returns `null` (the entry is already at that extreme), the sheet just closes with no
  dialog and no server call — the same "no-op" precedent as a drag dropped at its own position.
- Otherwise, a new `PendingMoveEnd` state (parallel to, not merged with, the drag flows' pending
  states) drives `<PairSwitchConfirmDialog unit="team" .../>` — the same component and copy the
  row-drag already introduced, no new i18n keys needed.

Worth naming as an observed consequence, not a special case requiring extra design: moving to the
very front/back is rarely a magnitude-1 move, so most real taps will show the "N teams will shift"
count wording; the adjacent two-way "switch A ⇄ B?" phrasing only appears when the entry starts
exactly one slot from that end.

### 5. Sheet and confirmation dialog never coexist — avoids a real focus-trap collision

Both `Sheet` (`apps/web/src/components/ui/sheet.tsx`) and `Dialog`
(`apps/web/src/components/ui/dialog.tsx`) use `useFocusTrap`, each attaching its own
`document`-level `Escape`/`Tab` listener. If both were open at once, their listeners would fire in
attachment order and fight over Tab-cycling and Escape. The fix: closing the sheet
(`setMenuEntryId(null)`) happens in the *same* handler that opens `PendingMoveEnd`, so React
batches both into one render — the sheet is never functionally open at the same time as the
confirmation dialog.

### 6. No undo toast

Same reasoning as both drag flows: the blocking confirm already gates the action, so it replaces
rather than supplements an undo toast. `handleRemove`'s own undo toast, right next to these two
buttons in the same sheet, is unaffected — this only touches `moveTop`/`moveBottom`.

## Edge cases

- **Entry already at the requested extreme:** `planRowSwitch` returns `null` (`oldIndex ===
  newIndex`); the sheet closes, nothing else happens.
- **`actions.moveTop`/`moveBottom` rejects after Confirm:** surface `queue.actions.error` via
  `onError` — no local state to revert, since none was applied.
- **`entryId` not found in `orderIds`** (e.g. stale reference from a concurrent removal):
  `planRowSwitch` returns `null` via its existing `movedId === undefined` guard — same no-op path.

## Testing

- `QueueActionsSheet.test.tsx`: replace direct `actions.moveTop`/`moveBottom` assertions with
  assertions that tapping "לראש התור"/"לסוף התור" calls the new `onRequestMoveTop`/
  `onRequestMoveBottom` props (not `actions.moveTop`/`moveBottom` directly) and closes the sheet;
  `actions.moveTop`/`moveBottom` are no longer called from this component at all.
- `QueueList.test.tsx`: new tests for the lifted flow — requesting a move-to-top/bottom that
  changes the order opens a confirmation with the correct adjacent-vs-count wording; `actions
  .moveTop`/`moveBottom` is called only after Confirm, with the correct `entryId`; Cancel closes
  the dialog without ever calling `actions.moveTop`/`moveBottom`; requesting a move when the entry
  is already at that extreme opens no dialog and calls nothing.
