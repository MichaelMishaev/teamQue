# Live reflow feedback for pair drag-and-drop

**Status:** approved
**Date:** 2026-07-13
**Supersedes:** the "static placeholder" scope cut in `docs/superpowers/specs/2026-07-13-queue-pair-move-design.md` (dragging section, and "Known limitations" bullet 2)

## Problem

The pair-drag gesture (double-tap-and-hold a pair's grip, then drag — see the linked spec) already computes the correct drop-target index continuously as the pointer moves, via `indexForPointerY` (`apps/web/src/lib/pair-drag-gesture.ts`). But nothing on screen shows that value: the dashed placeholder box stays frozen at the dragged pair's *original* slot for the whole gesture, and the other cards don't move until the pointer is released, at which point the list snaps straight to the new order. Staff dragging a pair get no feedback about where it will land until it's too late to correct — reported as "very hard to drop."

## Chosen approach: transform-based live reflow, no DOM reordering

Keep every pair card in its **original DOM order** for the duration of the drag — don't re-sort the rendered array on every pointer move. Instead, apply a CSS `transform: translateY(...)` to the cards that need to visually move, exactly the technique `@dnd-kit`'s `useSortable` already uses for the existing per-row drag (`CSS.Transform.toString(transform)`, `QueueList.tsx`). This avoids remounting/reflowing real DOM nodes (which would kill any chance of a smooth animation) and lets a plain CSS `transition` animate the shift — which also means `prefers-reduced-motion` support is free, via the app's existing global `transition-duration: 0.01ms !important` override (`apps/web/src/index.css:101`), no new JS needed.

Two rules, computed from a **single `getBoundingClientRect` measurement pass taken at drag-start** (not re-measured every frame, to avoid a measurement/transform feedback loop):

1. **Every sibling card shifts by exactly the dragged pair's own height**, up or down, never more — a card either falls between the drag's origin and current target (and shifts by that fixed amount to open/close the gap) or it doesn't (and doesn't move at all). This holds regardless of the individual heights of the cards in between, because only one gap (the dragged pair's height) is moving through the list.
2. **The placeholder (the existing dashed "gap" box) travels the real cumulative distance** to the current target slot — sum of the heights of whatever cards it's passing over, from the one initial measurement pass.

Net effect: the dashed gap visually slides to trail the current drop target as the pointer moves, and the cards between the old and new position slide out of its way in real time. The floating dragged-card overlay (already implemented) is unaffected — it continues to track the raw pointer position.

Nothing about the underlying commit mechanism changes: `reorderGroups` and the `reorderLine` call on drop are untouched. This is purely a rendering change for what happens *during* the drag, between grip-hold and release.

## Testing strategy

1. **Pure function unit tests**, colocated with the existing `indexForPointerY` tests in `pair-drag-gesture.test.ts`: given arrays of `{top, height}` rects plus a `fromIndex`/`toIndex`, assert the sibling-shift amount and the placeholder's cumulative offset — no DOM involved, matching the file's existing style.
2. **WYSIWYG consistency test** (the one that most directly answers "test the drop"): for a spread of `fromIndex`/`toIndex` combinations over arrays of mixed-height groups, assert that the order implied by the live-reflow preview (siblings sorted by their shifted visual position) is always identical to what `reorderGroups()` actually produces. This guarantees the preview shown while dragging can never disagree with what happens on release.
3. **Extend `QueueList.test.tsx`'s existing drag tests** (e.g. `"drags the front pair past the middle pair and reorders on drop"`) to also assert the expected transform/style is present on sibling cards mid-drag, before `pointerup` fires — today those tests only check the post-drop `reorderLine` call.
4. **Manual verification in a real browser** after implementation — a unit test can verify the math is right but not that the motion feels right.

## Out of scope

- No change to the gesture state machine (`pairGestureReducer`), the double-tap-and-hold timing, or the drop commit path (`reorderGroups` / `reorderLine` / undo toast).
- No change to the "second, independent drag system" trade-off already documented in the pair-move spec — this still doesn't unify with `@dnd-kit`'s per-row sortable context.
- Keyboard/assistive-tech users are unaffected (still no keyboard equivalent, as noted in the original spec) — this is a pointer-drag visual improvement only.
