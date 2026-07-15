import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { QueueEntryView } from 'shared'
import { PairSwitchConfirmDialog } from '@/components/PairSwitchConfirmDialog'
import { QueuePairGroup, type QueuePairGroupVariant } from '@/components/QueuePairGroup'
import { QueueRow } from '@/components/QueueRow'
import { QueueActionsSheet } from '@/components/QueueActionsSheet'
import { t } from '@/i18n'
import {
  pairGestureReducer,
  DOUBLE_TAP_WINDOW_MS,
  HOLD_MS,
  indexForPointerY,
  computeReflow,
  type PairGestureState,
  type RectLike,
} from '@/lib/pair-drag-gesture'
import { buildPairGroups, planRowSwitch, reorderGroups } from '@/lib/queue-pairing'
import { formatTimeOfDay } from '@/lib/time'
import { useSessionActions } from '@/state/SessionActions'

/**
 * Single responsibility: the line — touch-first drag-to-reorder (dnd-kit,
 * handle-only listeners so the page still scrolls). Consecutive entries are
 * grouped into predicted pairs (QueuePairGroup) with a games-ahead/eta
 * estimate per row past the front pair (docs/superpowers/specs/2026-07-13-
 * queue-pairing-and-eta-design.md). ⋯ opens QueueActionsSheet. Reorder is
 * optimistic: applied to local order immediately, reverted if
 * SessionActions rejects it (client-prd §5, US-030).
 *
 * Each pair group also carries a double-tap-and-hold-then-drag gesture on
 * its own grip handle, letting staff move the whole pair as a block
 * (docs/superpowers/specs/2026-07-13-queue-pair-move-design.md). While
 * dragging, the other pair cards live-reflow (CSS transform, no DOM
 * reordering) to open a gap at the current drop target
 * (docs/superpowers/specs/2026-07-13-queue-pair-drag-live-reflow-design.md).
 * Releasing the pointer freezes that visual and opens
 * PairSwitchConfirmDialog rather than committing immediately — staff must
 * explicitly confirm before the reorder is applied
 * (docs/superpowers/specs/2026-07-15-pair-switch-confirm-design.md).
 * The single-row ☰ drag (dnd-kit, handleDragEnd) is gated the same way,
 * though with no drag-visual-freeze step — dnd-kit already animates the
 * drop via the same orderIds state this defers committing to the server
 * (docs/superpowers/specs/2026-07-15-row-switch-confirm-design.md).
 * QueueActionsSheet's ⋯-menu move-to-top/bottom actions get the same
 * confirmation too (pendingMoveEnd), with no local optimism at all —
 * unlike both drags, those actions never applied anything locally to begin
 * with, so Confirm just calls the server action directly
 * (docs/superpowers/specs/2026-07-15-move-end-confirm-design.md).
 */
export interface QueueListProps {
  queue: QueueEntryView[]
  matchDurationSec: number
  baseSec: number
  onError?: (message: string) => void
}

/** Pointer distance from a viewport edge that triggers auto-scroll during a pair drag. */
const DRAG_SCROLL_EDGE_PX = 80
/** Scroll amount per pointermove while the pointer sits in the edge zone. */
const DRAG_SCROLL_STEP_PX = 16
/** Cancel snap-back duration — matches the reflow's own CSS transition. */
const CANCEL_ANIMATION_MS = 150

function groupIdOf(group: { pairIndex: number; entryIds: string[] }): string {
  return group.entryIds[0] ?? `pair-${group.pairIndex}`
}

function namesOf(group: { entryIds: string[] }, byId: Map<string, QueueEntryView>): string[] {
  return group.entryIds.map((id) => byId.get(id)?.team.name).filter((name): name is string => Boolean(name))
}

interface PendingSwitch {
  groupId: string
  toIndex: number
  groupANames: string[]
  occupantNames: string[]
}

interface PendingRowSwitch {
  previousOrder: string[]
  nextOrder: string[]
  movedId: string
  occupantId: string
}

interface PendingMoveEnd {
  entryId: string
  end: 'top' | 'bottom'
  groupANames: string[]
  occupantNames: string[]
}

export function QueueList({ queue, matchDurationSec, baseSec, onError }: QueueListProps) {
  const actions = useSessionActions()
  const [orderIds, setOrderIds] = useState<string[]>(() => queue.map((e) => e.id))
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null)

  const gestureRef = useRef<PairGestureState>({ phase: 'idle' })
  const [gripVisual, setGripVisual] = useState<{ groupId: string; phase: 'armed' | 'holding' } | null>(null)
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdCleanupRef = useRef<(() => void) | null>(null)
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const [pendingSwitch, setPendingSwitch] = useState<PendingSwitch | null>(null)
  const [pendingRowSwitch, setPendingRowSwitch] = useState<PendingRowSwitch | null>(null)
  const [pendingMoveEnd, setPendingMoveEnd] = useState<PendingMoveEnd | null>(null)

  useEffect(() => {
    setOrderIds(queue.map((e) => e.id))
  }, [queue])

  function teardownActiveHold(): void {
    holdCleanupRef.current?.()
    holdCleanupRef.current = null
  }

  useEffect(() => {
    return () => {
      teardownActiveHold()
      if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current)
      if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current)
    }
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

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
      occupantId: plan.occupantId,
    })
  }

  const byId = new Map(queue.map((e) => [e.id, e]))
  const orderedEntries = orderIds.map((id) => byId.get(id)).filter((e): e is QueueEntryView => e !== undefined)
  const menuEntry = menuEntryId ? (byId.get(menuEntryId) ?? null) : null
  const pairGroups = buildPairGroups(
    orderedEntries.map((e) => e.id),
    baseSec,
    matchDurationSec,
  )

  const latestRef = useRef({ pairGroups, orderIds, byId, actions, onError })
  latestRef.current = { pairGroups, orderIds, byId, actions, onError }

  function applyGestureTransition(event: Parameters<typeof pairGestureReducer>[1]): PairGestureState {
    const next = pairGestureReducer(gestureRef.current, event)
    gestureRef.current = next
    if (next.phase === 'armed' || next.phase === 'holding') {
      setGripVisual({ groupId: next.groupId, phase: next.phase })
    } else {
      setGripVisual(null)
    }
    return next
  }

  function handleGripPointerDown(groupId: string, event: ReactPointerEvent<HTMLButtonElement>): void {
    event.preventDefault()
    if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current)
    if (gestureRef.current.phase === 'holding') teardownActiveHold()
    const next = applyGestureTransition({ type: 'GRIP_DOWN', groupId })

    if (next.phase === 'armed') {
      doubleTapTimerRef.current = setTimeout(() => {
        flushSync(() => applyGestureTransition({ type: 'DOUBLE_TAP_TIMEOUT' }))
      }, DOUBLE_TAP_WINDOW_MS)
      return
    }

    if (next.phase === 'holding') {
      const startClientY = event.clientY
      const cancelHold = (): void => {
        window.removeEventListener('pointerup', cancelHold)
        window.removeEventListener('pointermove', moveDuringHold)
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
        holdCleanupRef.current = null
        flushSync(() => applyGestureTransition({ type: 'CANCEL' }))
      }
      const moveDuringHold = (moveEvent: PointerEvent): void => {
        if (Math.abs(moveEvent.clientY - startClientY) > 8) cancelHold()
      }
      window.addEventListener('pointerup', cancelHold)
      window.addEventListener('pointermove', moveDuringHold)
      holdCleanupRef.current = () => {
        window.removeEventListener('pointerup', cancelHold)
        window.removeEventListener('pointermove', moveDuringHold)
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
      }
      holdTimerRef.current = setTimeout(() => {
        holdCleanupRef.current = null
        window.removeEventListener('pointerup', cancelHold)
        window.removeEventListener('pointermove', moveDuringHold)
        let dragging: PairGestureState = gestureRef.current
        flushSync(() => {
          dragging = applyGestureTransition({ type: 'HOLD_COMPLETE' })
        })
        if (dragging.phase === 'dragging') startDrag(groupId, startClientY)
      }, HOLD_MS)
    }
  }

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

  function clearDragState(): void {
    dragGroupIdRef.current = null
    dragStartRef.current = null
    dragRectsRef.current = []
    setDragGroupId(null)
  }

  function onDragEnd(): void {
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)

    const groupId = dragGroupIdRef.current
    const toIndex = dragOverIndexRef.current
    if (!groupId) return

    const { pairGroups: currentPairGroups, byId: currentById } = latestRef.current
    const fromIndex = currentPairGroups.findIndex((g) => groupIdOf(g) === groupId)
    const movedGroup = fromIndex === -1 ? undefined : currentPairGroups[fromIndex]

    if (fromIndex === -1 || fromIndex === toIndex || !movedGroup) {
      flushSync(() => clearDragState())
      return
    }

    // Whichever group lands in the dragged group's exact original slot is
    // always the original array's immediate neighbor in the direction of the
    // move — true for any drag distance, not just an adjacent one
    // (docs/superpowers/specs/2026-07-15-swap-partner-naming-design.md).
    const direction: 'up' | 'down' = toIndex < fromIndex ? 'up' : 'down'
    const occupantGroup = direction === 'down' ? currentPairGroups[fromIndex + 1] : currentPairGroups[fromIndex - 1]
    if (!occupantGroup) {
      flushSync(() => clearDragState())
      return
    }

    setPendingSwitch({
      groupId,
      toIndex,
      groupANames: namesOf(movedGroup, currentById),
      occupantNames: namesOf(occupantGroup, currentById),
    })
    // Drag refs/state are deliberately left as-is here (not cleared) — the floating
    // card and the live-reflow placeholder gap stay frozen at the drop target while
    // the confirmation dialog is open.
  }

  function handleConfirmSwitch(): void {
    const pending = pendingSwitch
    if (!pending) return
    const { pairGroups: currentPairGroups, orderIds: currentOrderIds, actions: currentActions, onError: currentOnError } = latestRef.current

    setPendingSwitch(null)
    clearDragState()

    const fromIndex = currentPairGroups.findIndex((g) => groupIdOf(g) === pending.groupId)
    if (fromIndex === -1) return
    const nextOrder = reorderGroups(currentPairGroups, fromIndex, pending.toIndex)
    const previousOrder = currentOrderIds
    setOrderIds(nextOrder)
    currentActions.reorderLine(nextOrder).catch(() => {
      setOrderIds(previousOrder)
      currentOnError?.(t('queue.actions.error'))
    })
  }

  function handleCancelSwitch(): void {
    setPendingSwitch(null)
    setDragOverIndex(dragFromIndexRef.current)
    if (floatingRef.current) {
      floatingRef.current.style.transition = `transform ${CANCEL_ANIMATION_MS}ms ease-out`
      floatingRef.current.style.transform = 'translateY(0px)'
    }
    cancelTimerRef.current = setTimeout(clearDragState, CANCEL_ANIMATION_MS)
  }

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

  function handleRequestMoveEnd(entryId: string, end: 'top' | 'bottom'): void {
    const oldIndex = orderIds.indexOf(entryId)
    const newIndex = end === 'top' ? 0 : orderIds.length - 1
    const plan = planRowSwitch(orderIds, oldIndex, newIndex)
    if (!plan) return
    setPendingMoveEnd({
      entryId,
      end,
      groupANames: namesOf({ entryIds: [plan.movedId] }, byId),
      occupantNames: namesOf({ entryIds: [plan.occupantId] }, byId),
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

  const reflow = dragGroupId && dragRectsRef.current.length > 0 ? computeReflow(dragRectsRef.current, dragFromIndexRef.current, dragOverIndex) : null

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
          <div ref={queueRef} className="flex flex-col gap-4">
            {pairGroups.map((group, groupIndex) => {
              const isNext = group.pairIndex === 0 && group.hasPartner
              const variant: QueuePairGroupVariant = isNext ? 'next' : group.hasPartner ? 'default' : 'solo'
              const label = isNext
                ? t('queue.pair.next', { index: group.pairIndex + 1 })
                : group.hasPartner
                  ? t('queue.pair.label', { index: group.pairIndex + 1 })
                  : t('queue.pair.waiting')
              const groupId = groupIdOf(group)
              const gripState = gripVisual?.groupId === groupId ? gripVisual.phase : 'idle'

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
                  {group.entryIds.map((id, iInGroup) => {
                    const entry = byId.get(id)
                    if (!entry) return null
                    return (
                      <SortableQueueRow
                        key={entry.id}
                        entry={entry}
                        index={group.pairIndex * 2 + iInGroup}
                        isNext={isNext}
                        grouped
                        {...(group.pairIndex !== 0 ? { gamesAhead: group.gamesAhead, etaSec: group.etaSec } : {})}
                        {...(!group.hasPartner ? { etaApprox: true } : {})}
                        onMenu={() => setMenuEntryId(entry.id)}
                      />
                    )
                  })}
                </QueuePairGroup>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
      {dragGroupId && dragStartRef.current && (
        <div
          ref={floatingRef}
          className="pointer-events-none fixed z-30 scale-[1.02] rotate-[0.6deg]"
          style={{ top: dragStartRef.current.top, left: dragStartRef.current.left, width: dragStartRef.current.width }}
        >
          <div className="flex flex-col overflow-hidden rounded-xl border border-accent bg-surface shadow-xl shadow-black/70 [&>*+*]:border-t [&>*+*]:border-accent-dim">
            {pairGroups
              .find((g) => groupIdOf(g) === dragGroupId)
              ?.entryIds.map((id) => {
                const draggedEntry = byId.get(id)
                if (!draggedEntry) return null
                return (
                  <QueueRow
                    key={draggedEntry.id}
                    position={orderIds.indexOf(draggedEntry.id) + 1}
                    teamName={draggedEntry.team.name}
                    {...(draggedEntry.team.nickname ? { nickname: draggedEntry.team.nickname } : {})}
                    gamesToday={draggedEntry.team.gamesToday}
                    {...(draggedEntry.team.lastPlayedAt ? { lastPlayedAt: formatTimeOfDay(draggedEntry.team.lastPlayedAt) } : {})}
                    grouped
                    dragging
                  />
                )
              })}
          </div>
        </div>
      )}
      {pendingSwitch && (
        <PairSwitchConfirmDialog
          open
          onConfirm={handleConfirmSwitch}
          onCancel={handleCancelSwitch}
          groupANames={pendingSwitch.groupANames}
          occupantNames={pendingSwitch.occupantNames}
        />
      )}
      {pendingRowSwitch && (
        <PairSwitchConfirmDialog
          open
          onConfirm={handleConfirmRowSwitch}
          onCancel={handleCancelRowSwitch}
          groupANames={namesOf({ entryIds: [pendingRowSwitch.movedId] }, byId)}
          occupantNames={namesOf({ entryIds: [pendingRowSwitch.occupantId] }, byId)}
        />
      )}
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
      {pendingMoveEnd && (
        <PairSwitchConfirmDialog
          open
          onConfirm={handleConfirmMoveEnd}
          onCancel={handleCancelMoveEnd}
          groupANames={pendingMoveEnd.groupANames}
          occupantNames={pendingMoveEnd.occupantNames}
        />
      )}
    </>
  )
}

function SortableQueueRow({
  entry,
  index,
  isNext,
  grouped,
  gamesAhead,
  etaSec,
  etaApprox,
  onMenu,
}: {
  entry: QueueEntryView
  index: number
  isNext: boolean
  grouped?: boolean
  gamesAhead?: number
  etaSec?: number
  etaApprox?: boolean
  onMenu: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style}>
      <QueueRow
        position={index + 1}
        teamName={entry.team.name}
        {...(entry.team.nickname ? { nickname: entry.team.nickname } : {})}
        gamesToday={entry.team.gamesToday}
        {...(entry.team.lastPlayedAt ? { lastPlayedAt: formatTimeOfDay(entry.team.lastPlayedAt) } : {})}
        next={isNext}
        dragging={isDragging}
        {...(grouped ? { grouped } : {})}
        {...(gamesAhead !== undefined ? { gamesAhead } : {})}
        {...(etaSec !== undefined ? { etaSec } : {})}
        {...(etaApprox ? { etaApprox } : {})}
        onMenu={onMenu}
        handleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}
