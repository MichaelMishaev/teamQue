# Live Reflow Feedback for Pair Drag-and-Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While dragging a pair (double-tap-and-hold grip gesture), show the other pair cards sliding live to open a gap at the current drop target, instead of a frozen placeholder that only snaps into place on release.

**Architecture:** Keep the DOM order of pair cards stable during a drag (no re-sorting the rendered array). Apply a CSS `transform: translateY(...)` to the cards that need to visually shift, computed by a new pure function `computeReflow` from a single `getBoundingClientRect` measurement pass taken once at drag-start. No change to the gesture state machine or the drop-commit path (`reorderGroups` / `reorderLine` / undo toast).

**Tech Stack:** React 19, TypeScript strict, Vitest + Testing Library (jsdom), Tailwind v4. No new dependencies.

## Global Constraints

- TDD: write the failing test before the implementation, for every task in this plan.
- TypeScript max-strict: no `any`, no non-null `!`, `noUncheckedIndexedAccess` (guard every array index access), `exactOptionalPropertyTypes`.
- No hardcoded user-facing strings — this plan adds no new strings, so no `he.json` changes are needed.
- Components stay presentational; gesture/DOM logic stays in `QueueList.tsx` per existing convention (see `QueuePairGroup.tsx`'s doc comment).
- Match existing code style exactly (Tailwind classes for static styling, inline `style` only for computed/dynamic values — see `floatingRef`'s existing className+style split in `QueueList.tsx`).

---

## Task 1: `computeReflow` pure function

**Files:**
- Modify: `apps/web/src/lib/pair-drag-gesture.ts`
- Test: `apps/web/src/lib/pair-drag-gesture.test.ts`

**Interfaces:**
- Consumes: existing `RectLike` (`{ top: number; height: number }`, already exported from this file).
- Produces: `computeReflow(rects: RectLike[], fromIndex: number, toIndex: number): ReflowResult` and `export interface ReflowResult { placeholderOffset: number; siblingOffsets: number[] }`. Task 3 imports both from `@/lib/pair-drag-gesture`.

`toIndex` uses the exact same convention as `indexForPointerY`'s return value and `reorderGroups`'s `toIndex` parameter (already in this codebase, `apps/web/src/lib/queue-pairing.ts:54`): an index into the *siblings* array (i.e. `rects` with `fromIndex` removed), matching JS `Array.prototype.splice` semantics.

- [ ] **Step 1: Write the failing tests**

Edit `apps/web/src/lib/pair-drag-gesture.test.ts` — change the top import line and add two new `describe` blocks after the existing `indexForPointerY` block:

```ts
import { describe, expect, it } from 'vitest'
import { computeReflow, indexForPointerY, pairGestureReducer, type PairGestureState } from './pair-drag-gesture'
import { buildPairGroups, reorderGroups, type PairGroup } from './queue-pairing'
```

```ts
describe('computeReflow', () => {
  const rects = [
    { top: 0, height: 132 },
    { top: 148, height: 132 },
    { top: 296, height: 66 },
    { top: 378, height: 132 },
  ]

  it('shifts the passed-over siblings up and moves the placeholder down when dragging down', () => {
    expect(computeReflow(rects, 0, 2)).toEqual({
      placeholderOffset: 230,
      siblingOffsets: [0, -148, -148, 0],
    })
  })

  it('shifts the passed-over siblings down and moves the placeholder up when dragging up', () => {
    expect(computeReflow(rects, 3, 0)).toEqual({
      placeholderOffset: -378,
      siblingOffsets: [148, 148, 148, 0],
    })
  })

  it('is a no-op when toIndex equals fromIndex', () => {
    expect(computeReflow(rects, 1, 1)).toEqual({
      placeholderOffset: 0,
      siblingOffsets: [0, 0, 0, 0],
    })
  })
})

describe('computeReflow matches reorderGroups (the live preview must never disagree with the drop outcome)', () => {
  const groups: PairGroup[] = buildPairGroups(['a', 'b', 'c', 'd', 'e', 'f'], 0, 480)
  const groupRects = [
    { top: 0, height: 132 },
    { top: 148, height: 132 },
    { top: 296, height: 132 },
  ]

  function visualEntryOrder(fromIndex: number, toIndex: number): string[] {
    const { placeholderOffset, siblingOffsets } = computeReflow(groupRects, fromIndex, toIndex)
    return groups
      .map((group, i) => {
        const rect = groupRects[i]
        const top = rect ? rect.top + (i === fromIndex ? placeholderOffset : (siblingOffsets[i] ?? 0)) : 0
        return { group, top }
      })
      .sort((a, b) => a.top - b.top)
      .flatMap((x) => x.group.entryIds)
  }

  it.each([
    [0, 1],
    [0, 2],
    [1, 0],
    [2, 0],
    [1, 2],
    [2, 1],
    [0, 0],
  ])('drag from %i to %i previews the same order reorderGroups commits', (fromIndex, toIndex) => {
    expect(visualEntryOrder(fromIndex, toIndex)).toEqual(reorderGroups(groups, fromIndex, toIndex))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web vitest run src/lib/pair-drag-gesture.test.ts`
Expected: FAIL — `computeReflow` is not exported from `./pair-drag-gesture`.

- [ ] **Step 3: Implement `computeReflow`**

Append to `apps/web/src/lib/pair-drag-gesture.ts` (after `indexForPointerY`):

```ts
export interface ReflowResult {
  /** Pixels the dragged group's placeholder must translate to reach the current drop target. */
  placeholderOffset: number
  /** Pixels each group (indexed by its original position) must translate to open/close the
   *  gap; 0 for unaffected groups and for the dragged group's own index. */
  siblingOffsets: number[]
}

/**
 * Given every group's natural (pre-drag) rect in original order, computes how far the dragged
 * group's placeholder and each unaffected sibling must translate to visually reflect dropping
 * at `toIndex`. Derived from a single measurement pass (rects captured once at drag-start) so
 * it never re-reads — and never fights — live transformed layout.
 */
export function computeReflow(rects: RectLike[], fromIndex: number, toIndex: number): ReflowResult {
  const dragged = rects[fromIndex]
  const first = rects[0]
  const second = rects[1]
  const gap = first && second ? second.top - (first.top + first.height) : 0
  const shiftUnit = dragged ? dragged.height + gap : 0

  const siblingOffsets = rects.map((_, originalIndex) => {
    if (originalIndex === fromIndex) return 0
    const trimmedIndex = originalIndex < fromIndex ? originalIndex : originalIndex - 1
    if (originalIndex < fromIndex && trimmedIndex >= toIndex) return shiftUnit
    if (originalIndex > fromIndex && trimmedIndex < toIndex) return -shiftUnit
    return 0
  })

  let placeholderOffset = 0
  if (toIndex > fromIndex) {
    for (let i = fromIndex + 1; i <= toIndex; i++) {
      const r = rects[i]
      if (r) placeholderOffset += r.height + gap
    }
  } else if (toIndex < fromIndex) {
    for (let i = toIndex; i <= fromIndex - 1; i++) {
      const r = rects[i]
      if (r) placeholderOffset -= r.height + gap
    }
  }

  return { placeholderOffset, siblingOffsets }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web vitest run src/lib/pair-drag-gesture.test.ts`
Expected: PASS (all tests, including the 7 `it.each` cases)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/pair-drag-gesture.ts apps/web/src/lib/pair-drag-gesture.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add computeReflow for live pair-drag reflow feedback

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `style` passthrough on `QueuePairGroup`

**Files:**
- Modify: `apps/web/src/components/QueuePairGroup.tsx`
- Test: `apps/web/src/components/QueuePairGroup.test.tsx`

**Interfaces:**
- Produces: `QueuePairGroupProps.style?: CSSProperties`, applied to the component's root `<div data-group-id>`. Task 3 passes a computed `translateY` transform through this prop.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/components/QueuePairGroup.test.tsx`:

```tsx
it('applies a passed-through style to the root element', () => {
  const { container } = render(
    <QueuePairGroup label="זוג 2" variant="default" groupId="e3" style={{ transform: 'translateY(24px)' }}>
      <div>Row</div>
    </QueuePairGroup>,
  )
  expect((container.querySelector('[data-group-id="e3"]') as HTMLElement).style.transform).toBe('translateY(24px)')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/components/QueuePairGroup.test.tsx`
Expected: FAIL — TypeScript error / `style` prop not recognized (or the style is silently dropped, so `style.transform` is an empty string).

- [ ] **Step 3: Implement the `style` passthrough**

In `apps/web/src/components/QueuePairGroup.tsx`, change the top import:

```ts
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
```

Add `style` to the props interface:

```ts
export interface QueuePairGroupProps {
  label: string
  variant: QueuePairGroupVariant
  children: ReactNode
  /** DOM identity used by QueueList's imperative drag code (getBoundingClientRect lookups). */
  groupId?: string
  gripState?: PairGripState
  onGripPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  /** Passed through to the root element — used by QueueList to apply a live-drag reflow transform. */
  style?: CSSProperties
}
```

Destructure and apply it in the component:

```tsx
export function QueuePairGroup({
  label,
  variant,
  children,
  groupId,
  gripState = 'idle',
  onGripPointerDown,
  style,
}: QueuePairGroupProps) {
  return (
    <div className="flex flex-col gap-1.5" data-group-id={groupId} style={style}>
```

(The rest of the component is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/components/QueuePairGroup.test.tsx`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/QueuePairGroup.tsx apps/web/src/components/QueuePairGroup.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): pass a style prop through QueuePairGroup's root element

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire live reflow into `QueueList`

**Files:**
- Modify: `apps/web/src/components/QueueList.tsx`
- Test: `apps/web/src/components/QueueList.test.tsx`

**Interfaces:**
- Consumes: `computeReflow`, `type ReflowResult`, `type RectLike` from `@/lib/pair-drag-gesture` (Task 1); `QueuePairGroupProps.style` (Task 2).
- No new exports — this task only changes `QueueList`'s internal drag mechanics and render output.

- [ ] **Step 1: Write the failing test**

Append to the `describe('pair drag gesture — dragging', ...)` block in `apps/web/src/components/QueueList.test.tsx` (after the existing `"drags the front pair past the middle pair and reorders on drop"` test):

```ts
it('slides the placeholder and the passed-over sibling toward the live drop target before the drop', () => {
  const { container } = renderQueueList(sixEntryQueue())
  const groupEls = [...container.querySelectorAll<HTMLElement>('[data-group-id]')]
  mockRect(groupEls[0]!, { top: 0, height: 132 })
  mockRect(groupEls[1]!, { top: 148, height: 132 })
  mockRect(groupEls[2]!, { top: 296, height: 132 })

  const grip1 = groupEls[0]!.querySelector('button') as HTMLElement
  fireEvent.pointerDown(grip1, { clientY: 10 })
  fireEvent.pointerDown(grip1, { clientY: 10 })
  vi.advanceTimersByTime(400)
  fireEvent.pointerMove(window, { clientY: 250 }) // past group2's midpoint (214), before group3's (362) -> toIndex 1

  const placeholder = container.querySelector('[data-group-id="e1"]') as HTMLElement
  expect(placeholder.style.transform).toBe('translateY(148px)')

  const shiftedSibling = container.querySelector('[data-group-id="e3"]') as HTMLElement
  expect(shiftedSibling.style.transform).toBe('translateY(-148px)')

  const untouchedSibling = container.querySelector('[data-group-id="e5"]') as HTMLElement
  expect(untouchedSibling.style.transform).toBe('translateY(0px)')

  fireEvent.pointerUp(window, { clientY: 250 })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/components/QueueList.test.tsx -t "slides the placeholder"`
Expected: FAIL — `placeholder.style.transform` is an empty string (nothing sets it yet).

- [ ] **Step 3: Implement the wiring**

In `apps/web/src/components/QueueList.tsx`, update the top import from `@/lib/pair-drag-gesture`:

```ts
import {
  pairGestureReducer,
  DOUBLE_TAP_WINDOW_MS,
  HOLD_MS,
  indexForPointerY,
  computeReflow,
  type PairGestureState,
  type RectLike,
} from '@/lib/pair-drag-gesture'
```

Update the class doc comment (the paragraph describing the drag's placeholder behavior):

```ts
 * Each pair group also carries a double-tap-and-hold-then-drag gesture on
 * its own grip handle, letting staff move the whole pair as a block
 * (docs/superpowers/specs/2026-07-13-queue-pair-move-design.md). While
 * dragging, the other pair cards live-reflow (CSS transform, no DOM
 * reordering) to open a gap at the current drop target
 * (docs/superpowers/specs/2026-07-13-queue-pair-drag-live-reflow-design.md)
 * — only the actual drop commits a new order.
```

Add new refs and state alongside the existing drag refs:

```ts
  const queueRef = useRef<HTMLDivElement>(null)
  const floatingRef = useRef<HTMLDivElement>(null)
  const [dragGroupId, setDragGroupId] = useState<string | null>(null)
  const dragGroupIdRef = useRef<string | null>(null)
  const dragOverIndexRef = useRef(0)
  const [dragOverIndex, setDragOverIndex] = useState(0)
  const dragFromIndexRef = useRef(0)
  const dragRectsRef = useRef<RectLike[]>([])
  const dragScrollStartRef = useRef(0)
  const dragStartRef = useRef<{ top: number; left: number; width: number; height: number; clientY: number } | null>(null)
```

Replace `startDrag`:

```ts
  function startDrag(groupId: string, startClientY: number): void {
    const groupEls = [...(queueRef.current?.querySelectorAll<HTMLElement>('[data-group-id]') ?? [])]
    const fromIndex = pairGroups.findIndex((g) => groupIdOf(g) === groupId)
    const groupEl = groupEls[fromIndex]
    if (!groupEl || fromIndex === -1) return
    const rect = groupEl.getBoundingClientRect()
    dragStartRef.current = { top: rect.top, left: rect.left, width: rect.width, height: rect.height, clientY: startClientY }
    dragRectsRef.current = groupEls.map((el) => {
      const r = el.getBoundingClientRect()
      return { top: r.top, height: r.height }
    })
    dragFromIndexRef.current = fromIndex
    dragScrollStartRef.current = window.scrollY
    dragGroupIdRef.current = groupId
    dragOverIndexRef.current = fromIndex
    flushSync(() => {
      setDragGroupId(groupId)
      setDragOverIndex(fromIndex)
    })
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
  }
```

Replace `onDragMove`:

```ts
  function onDragMove(event: PointerEvent): void {
    const start = dragStartRef.current
    if (!start || !floatingRef.current || !dragGroupIdRef.current) return
    const delta = event.clientY - start.clientY
    floatingRef.current.style.transform = `translateY(${delta}px)`

    // Auto-scroll near the viewport edges — without this, a pair below the fold
    // (e.g. swapping pair 2 with pair 4/5 in a longer queue) is unreachable, since
    // this drag uses raw pointer tracking rather than native drag-and-drop, which
    // browsers auto-scroll for free.
    if (event.clientY < DRAG_SCROLL_EDGE_PX) {
      window.scrollBy({ top: -DRAG_SCROLL_STEP_PX })
    } else if (event.clientY > window.innerHeight - DRAG_SCROLL_EDGE_PX) {
      window.scrollBy({ top: DRAG_SCROLL_STEP_PX })
    }

    // siblingRects come from the one measurement pass taken at drag-start (dragRectsRef),
    // adjusted by however far the page has scrolled since — never re-queried live, so
    // applying a reflow transform to a sibling can't feed back into this calculation.
    const scrollDelta = window.scrollY - dragScrollStartRef.current
    const siblingRects = dragRectsRef.current
      .filter((_, i) => i !== dragFromIndexRef.current)
      .map((r) => ({ top: r.top - scrollDelta, height: r.height }))
    const newIndex = indexForPointerY(siblingRects, event.clientY)
    if (newIndex !== dragOverIndexRef.current) {
      dragOverIndexRef.current = newIndex
      flushSync(() => setDragOverIndex(newIndex))
    }
  }
```

In `onDragEnd`, clear the new ref alongside the existing resets:

```ts
  function onDragEnd(): void {
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)

    const groupId = dragGroupIdRef.current
    const toIndex = dragOverIndexRef.current
    dragGroupIdRef.current = null
    dragStartRef.current = null
    dragRectsRef.current = []
    flushSync(() => setDragGroupId(null))
    if (!groupId) return
```

(the rest of `onDragEnd` is unchanged)

Add the `reflow` computation right before the JSX `return`, and thread it into the render loop. Change:

```ts
  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
          <div ref={queueRef} className="flex flex-col gap-4">
            {pairGroups.map((group) => {
```

to:

```ts
  const reflow = dragGroupId && dragRectsRef.current.length > 0 ? computeReflow(dragRectsRef.current, dragFromIndexRef.current, dragOverIndex) : null

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
          <div ref={queueRef} className="flex flex-col gap-4">
            {pairGroups.map((group, groupIndex) => {
```

Update the placeholder branch to apply `reflow.placeholderOffset`:

```tsx
              if (groupId === dragGroupId && dragStartRef.current) {
                return (
                  <div
                    key={groupId}
                    data-group-id={groupId}
                    className="rounded-xl border-2 border-dashed border-accent-dim bg-accent-dim/5 transition-transform duration-150 ease-out"
                    style={{
                      height: dragStartRef.current.height,
                      transform: `translateY(${reflow?.placeholderOffset ?? 0}px)`,
                    }}
                  />
                )
              }
```

Update the `QueuePairGroup` render to apply each sibling's `reflow.siblingOffsets` entry via the new `style` prop:

```tsx
              return (
                <QueuePairGroup
                  key={groupId}
                  groupId={groupId}
                  label={label}
                  variant={variant}
                  gripState={gripState}
                  onGripPointerDown={(event) => handleGripPointerDown(groupId, event)}
                  {...(reflow
                    ? { style: { transform: `translateY(${reflow.siblingOffsets[groupIndex] ?? 0}px)`, transition: 'transform 150ms ease-out' } }
                    : {})}
                >
```

(the rest of the `QueuePairGroup` children/map is unchanged)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/components/QueueList.test.tsx`
Expected: PASS — every test in the file, including the new one and all pre-existing drag tests (they're unaffected: `startDrag`/`onDragMove`'s measurement timing relative to `mockRect` calls is unchanged, and the drop-commit path `onDragEnd` is untouched).

- [ ] **Step 5: Run the full web test suite**

Run: `pnpm --filter web vitest run`
Expected: PASS — no regressions elsewhere.

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter web typecheck` (or `pnpm typecheck` from the repo root)
Expected: PASS — no new `any`/non-null-assertion/unchecked-index-access errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/QueueList.tsx apps/web/src/components/QueueList.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): live-reflow other pair cards while dragging a pair

Staff reported the pair-drag gesture was hard to drop accurately —
the placeholder froze at the origin slot for the whole drag and the
reorder only became visible on release. Other cards now slide to open
a gap at the live drop target as the pointer moves.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Manual browser verification

**Files:** none (no code changes — verification only)

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev` (from repo root)

- [ ] **Step 2: Drive the gesture in a real browser**

Using browser automation (or by hand): open the running app, tap a pair's grip icon twice within 350ms, hold ~400ms until the card lifts, then drag it up and down past several other pairs before releasing.

- [ ] **Step 3: Confirm the following, then release**

- The other pair cards visibly slide to open a gap that tracks your finger/pointer, not just the floating card moving on top of a static list.
- The gap lands exactly where the pair ends up after release (no snap/jump to a different slot on drop).
- Dragging near the top/bottom edge still auto-scrolls smoothly (regression check for the auto-scroll feature from commit `41537ae`).
- With OS-level "reduce motion" enabled, the reflow still ends up correct but without an animated slide (instant snap).

- [ ] **Step 4: Report result**

If any of the above doesn't hold, note exactly what was observed (which check failed, what happened instead) so the specific task above can be revisited — don't silently patch around it.

---

## Self-Review

**Spec coverage:** mechanism (single measurement pass, siblings shift by exactly the dragged pair's height, placeholder travels the cumulative distance) — Task 1 + Task 3. WYSIWYG consistency test — Task 1. Extended `QueueList` drag test asserting mid-drag transforms — Task 3. Manual browser verification — Task 4. `prefers-reduced-motion` — free via the existing global CSS override (`apps/web/src/index.css:101`), verified manually in Task 4, no code needed. Out-of-scope items (gesture state machine, drop commit path, keyboard equivalent, dnd-kit unification) — untouched by every task above, confirmed by inspecting each modified function.

**Placeholder scan:** none — every step has complete, runnable code and exact commands.

**Type consistency:** `RectLike` (`{ top, height }`) matches between Task 1's `computeReflow` signature and Task 3's `dragRectsRef`/`siblingRects` usage. `ReflowResult`'s `placeholderOffset`/`siblingOffsets` field names match between Task 1's definition and Task 3's render-time destructuring. `QueuePairGroupProps.style` matches between Task 2's definition and Task 3's spread usage. `groupIdOf`, `pairGroups`, `dragGroupIdRef`, `dragStartRef`, `dragOverIndexRef` are all pre-existing and unchanged in signature — only new refs/state (`dragFromIndexRef`, `dragRectsRef`, `dragScrollStartRef`, `dragOverIndex`) are introduced, each used consistently across the `startDrag`/`onDragMove`/`onDragEnd`/render steps in Task 3.
