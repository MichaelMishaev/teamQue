# Move a whole pair up/down in the queue

**Status:** approved
**Date:** 2026-07-13

## Problem

Queue entries are grouped into predicted pairs for display (`docs/superpowers/specs/2026-07-13-queue-pairing-and-eta-design.md`), but the only way to reorder the line today is dragging one entry at a time (per-row `≡` handle, dnd-kit) or the per-entry `moveTop`/`moveBottom` actions in the `⋯` sheet. Staff who want to promote or demote an entire pair — e.g. push a pair that isn't ready back a slot — have to drag both of its rows individually and hope they land adjacent to each other again. There's no single action that treats a pair as the unit being moved.

## Chosen approach

A dedicated **pair-level grip handle** on each `QueuePairGroup` card, activated only by **double-tap-and-hold**, then dragged to reorder the whole pair as one block. Explored and validated interactively via three Artifact mockup iterations (see Mockups below) before settling here.

### Why double-tap-and-hold, not simpler controls

Two earlier directions were mocked and rejected:

1. **Up/down arrow buttons** on the pair header (Mobbin reference: Upwork's "Reorder portfolio projects"). Approved in concept, then rejected as too visually heavy even after shrinking the visible glyph while preserving a 44px hit box (ghost/mini-chip/stepper-pill variants were all mocked). The deeper issue surfaced during review wasn't glyph size — it was that a single, ordinary tap could move a pair by accident.
2. **Extend the existing row drag to carry the pair along.** Rejected up front (first question of this brainstorm) — dragging a 2-row block via an existing single-row handle doesn't communicate "this drags both rows" and risks colliding with the existing per-entry drag semantics.

The requirement that emerged is structural, not cosmetic: **an accidental single tap, or a swipe/scroll gesture, must never move a pair.** Double-tap-and-hold satisfies this directly — it's not a pattern common in the Mobbin reference set (most reorder screens use plain drag-handle-only), but it was the explicit ask after the arrow/misclick discussion, and it composes cleanly with this app's existing "no blocking confirm dialogs, ever" rule (design.md §4) since the gesture itself is the safeguard, not a dialog.

### Gesture state machine

```
idle --(pointerdown on grip)--> armed --(pointerdown on same grip within 350ms)--> holding --(held 380ms without release/move>8px)--> dragging
armed --(350ms elapses without 2nd tap)--> idle
holding --(pointerup or pointermove>8px before 380ms)--> idle
dragging --(pointerup)--> idle (+ commits new order)
```

- `DOUBLE_TAP_WINDOW_MS = 350`, `HOLD_MS = 380` — named constants, tunable without touching the state machine.
- **armed**: grip icon shows an amber pulsing ring — "tap again and hold."
- **holding**: grip icon fills with an accent-green ring over the hold duration — releasing early (pointerup) or moving >8px before the ring completes cancels back to idle with no move.
- **dragging**: the pair's card lifts (scale 1.02, slight rotate, accent border + shadow — the same visual language `QueueRow` already uses for `dragging` on a single row) and tracks the pointer vertically. Other pair cards live-reflow to open a gap at the current drop target as the pointer moves — see `docs/superpowers/specs/2026-07-13-queue-pair-drag-live-reflow-design.md` for the mechanism (this was initially shipped as a static placeholder with no live preview, then upgraded after staff reported the static version was hard to drop accurately). Releasing commits the new position; releasing over no valid target is a no-op (card returns to its last valid slot).
- Tapping a **different** pair's grip mid-sequence discards the in-progress attempt and restarts armed on the new target.

### Scope: pairs only, not the solo leftover

The grip handle renders only on `hasPartner` (2-entry) `QueuePairGroup`s. The trailing odd-length "ממתין/ה לזוג" solo entry does not get one — it's already individually reorderable via its own row's existing `≡` handle, so a second gesture on the same single row would be redundant.

### Front pair ("זוג 1 · הבא") needs no special-case logic

The earlier arrow-based design required explicit rules ("front pair: down-arrow only, no up-arrow") because discrete step-arrows needed to know they were at the boundary. Free-drag makes this unnecessary: position 0 is already the topmost slot, so the front pair can only ever be dragged *down* — there's nothing above it to drag into. Symmetrically, any other pair can be dragged **up into position 0**, which produces the identical end state (the dragged pair becomes the new "הבא"). No pair is ever locked out of becoming the front pair; there's simply nothing to promote *above* it once it's there.

To be explicit: the front pair **gets the same grip handle as every other pair** — it is not suppressed or special-cased in the component. The "down only" behavior is a natural consequence of its position, not a rule the code needs to enforce.

### Wiring to the existing reorder mechanism

On drop, the full flattened `entryIds` order (all rows across all groups, in their new group order) is computed client-side and passed through the **same `actions.reorderLine(next)`** call the existing per-row dnd-kit handler already uses in `QueueList.tsx` — optimistic apply, revert on rejection. No new API endpoint. This is a second, independent drag mechanism living alongside dnd-kit (scoped to a dedicated handle element that dnd-kit's `PointerSensor` never attaches to), not a unification of the two — restructuring the existing flat per-entry `SortableContext` into a nested grouped one was considered out of scope for this feature.

### Undo, not confirm

Every completed pair move shows the existing 5-second undo toast (`apps/web/src/components/UndoToast.tsx`, `showUndoToast`) — e.g. "הוזז/ה טל / נדב למעלה" with a "בטל" action — exactly the mechanism already used for `removeFromLine`. Tapping "בטל" re-issues `reorderLine` with the pre-move order. This is the app's one general mechanism for letting staff walk back a low-stakes mistake (design.md §4); it is not new UX, just a new call site.

## Known limitations

- **Touch/pointer-only.** There is no keyboard equivalent for "swap this pair with its neighbor" — keyboard or assistive-tech users fall back to the existing per-entry `moveTop`/`moveBottom` actions in the `⋯` sheet, which are coarser (jump to front/back, not swap-with-neighbor) but already accessible today. Not gating this design; worth revisiting if it becomes a real usage pattern.
- **Second, independent drag system.** The pair-level gesture and dnd-kit's per-row drag are two separate implementations coexisting on the same screen. They don't share code today. If a third drag-like interaction is ever needed, unifying onto one system should be reconsidered rather than adding a third parallel implementation.
- ~~No live reflow of other cards during drag~~ — resolved, see `docs/superpowers/specs/2026-07-13-queue-pair-drag-live-reflow-design.md`.
- **Concurrent snapshot updates mid-drag.** If a realtime snapshot arrives while a pair-drag is in progress, the same pre-existing behavior as today's per-row drag applies: local order state is independent of the `queue` prop until the next snapshot resets it. This feature does not change or fix that pre-existing edge case.

## Components affected (for the follow-up plan)

- `apps/web/src/components/QueuePairGroup.tsx`: gains the grip handle for `hasPartner` groups only, plus `armed`/`holding` visual states as props (stays presentational — pointer/gesture logic lives in the parent per component conventions).
- New pure, unit-testable gesture state machine (exact file TBD in plan — likely colocated with `QueueList.tsx` or its own `apps/web/src/lib/pair-drag-gesture.ts`): transitions (`idle → armed → holding → dragging → idle`), timing constants, decoupled from DOM manipulation so the state transitions are testable per the repo's TDD hard rule without simulating real pointer geometry.
- `apps/web/src/components/QueueList.tsx`: owns the drag DOM manipulation (lifted-card positioning, placeholder-slot rendering, drop-target detection), flattens the reordered groups back into an `entryIds` array, calls `reorderLine`, and triggers the undo toast on success.
- `apps/web/src/i18n/he.json`: new keys for the grip's `aria-label`, the undo-toast move message (games/team-name interpolated, singular vs. plural not needed here since it's names not counts), consistent with the zero-hardcoded-Hebrew hard rule.

## Edge cases

- Single tap on the grip, or a tap that isn't followed by a second tap within 350ms → nothing happens, resets to idle.
- Second tap held for less than 380ms, or moved >8px before the hold completes → cancels, resets to idle, no move.
- Dragging a pair to a position adjacent to the trailing solo entry works uniformly — the solo entry is just a 1-entry block in the same flattened order, no special-case code needed (an improvement over the earlier arrow-model's boundary-case debate).
- `prefers-reduced-motion`: the armed pulse, holding fill-ring, and lifted-card animations are all disabled; the gesture's timing/logic is unaffected, only the eased visuals are removed.

## Mockups

Iterated live in an Artifact during brainstorming (not checked into the repo) — three passes: full 44×44 filled-square up/down arrows on every pair (rejected as too visually heavy) → three lighter arrow-glyph variants (ghost/mini-chip/stepper-pill) compared side by side (still rejected — the real issue was misclick risk, not size) → double-tap-and-hold-to-drag with amber-armed/green-holding grip states and a post-drop undo toast (approved).
