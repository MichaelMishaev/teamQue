import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { QueueEntryView } from 'shared'
import { QueuePairGroup, type QueuePairGroupVariant } from '@/components/QueuePairGroup'
import { QueueRow } from '@/components/QueueRow'
import { QueueActionsSheet } from '@/components/QueueActionsSheet'
import { showUndoToast } from '@/components/UndoToast'
import { t } from '@/i18n'
import {
  pairGestureReducer,
  DOUBLE_TAP_WINDOW_MS,
  HOLD_MS,
  indexForPointerY,
  type PairGestureState,
} from '@/lib/pair-drag-gesture'
import { buildPairGroups, reorderGroups } from '@/lib/queue-pairing'
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
 * (docs/superpowers/specs/2026-07-13-queue-pair-move-design.md). The
 * dragged group's original slot shows a placeholder for the drag's
 * duration; the other cards don't live-reflow, only the final drop reorders
 * the list — a deliberate scope simplification made during implementation
 * planning (the design spec itself originally called for live reflow; the
 * spec has since been updated to match this shipped behavior).
 */
export interface QueueListProps {
  queue: QueueEntryView[]
  matchDurationSec: number
  baseSec: number
  onError?: (message: string) => void
}

function groupIdOf(group: { pairIndex: number; entryIds: string[] }): string {
  return group.entryIds[0] ?? `pair-${group.pairIndex}`
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

  const queueRef = useRef<HTMLDivElement>(null)
  const floatingRef = useRef<HTMLDivElement>(null)
  const [dragGroupId, setDragGroupId] = useState<string | null>(null)
  const dragGroupIdRef = useRef<string | null>(null)
  const dragOverIndexRef = useRef(0)
  const dragStartRef = useRef<{ top: number; left: number; width: number; height: number; clientY: number } | null>(null)

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
    }
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderIds.indexOf(String(active.id))
    const newIndex = orderIds.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const previous = orderIds
    const next = arrayMove(orderIds, oldIndex, newIndex)
    setOrderIds(next)
    actions.reorderLine(next).catch(() => {
      setOrderIds(previous)
      onError?.(t('queue.actions.error'))
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
    const groupEl = queueRef.current?.querySelector<HTMLElement>(`[data-group-id="${groupId}"]`)
    const fromIndex = pairGroups.findIndex((g) => groupIdOf(g) === groupId)
    if (!groupEl || fromIndex === -1) return
    const rect = groupEl.getBoundingClientRect()
    dragStartRef.current = { top: rect.top, left: rect.left, width: rect.width, height: rect.height, clientY: startClientY }
    dragGroupIdRef.current = groupId
    dragOverIndexRef.current = fromIndex
    flushSync(() => setDragGroupId(groupId))
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
  }

  function onDragMove(event: PointerEvent): void {
    const start = dragStartRef.current
    if (!start || !floatingRef.current || !queueRef.current || !dragGroupIdRef.current) return
    const delta = event.clientY - start.clientY
    floatingRef.current.style.transform = `translateY(${delta}px)`

    const siblingRects = [...queueRef.current.querySelectorAll<HTMLElement>('[data-group-id]')]
      .filter((el) => el.dataset.groupId !== dragGroupIdRef.current)
      .map((el) => el.getBoundingClientRect())
    dragOverIndexRef.current = indexForPointerY(siblingRects, event.clientY)
  }

  function onDragEnd(): void {
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)

    const groupId = dragGroupIdRef.current
    const toIndex = dragOverIndexRef.current
    dragGroupIdRef.current = null
    dragStartRef.current = null
    flushSync(() => setDragGroupId(null))
    if (!groupId) return

    const {
      pairGroups: currentPairGroups,
      orderIds: currentOrderIds,
      byId: currentById,
      actions: currentActions,
      onError: currentOnError,
    } = latestRef.current

    const fromIndex = currentPairGroups.findIndex((g) => groupIdOf(g) === groupId)
    if (fromIndex === -1 || fromIndex === toIndex) return
    const movedGroup = currentPairGroups[fromIndex]
    if (!movedGroup) return

    const nextOrder = reorderGroups(currentPairGroups, fromIndex, toIndex)
    const previousOrder = currentOrderIds
    flushSync(() => setOrderIds(nextOrder))
    currentActions.reorderLine(nextOrder).catch(() => {
      setOrderIds(previousOrder)
      currentOnError?.(t('queue.actions.error'))
    })

    const names = movedGroup.entryIds
      .map((id) => currentById.get(id)?.team.name)
      .filter((name): name is string => Boolean(name))
      .join(' / ')
    const messageKey = toIndex < fromIndex ? 'toast.pairMovedUp' : 'toast.pairMovedDown'
    showUndoToast(
      messageKey,
      () => {
        setOrderIds(previousOrder)
        currentActions.reorderLine(previousOrder).catch(() => {
          currentOnError?.(t('queue.actions.error'))
        })
      },
      { names },
    )
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
          <div ref={queueRef} className="flex flex-col gap-4">
            {pairGroups.map((group) => {
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
                    className="rounded-xl border-2 border-dashed border-accent-dim bg-accent-dim/5"
                    style={{ height: dragStartRef.current.height }}
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
      {menuEntry && <QueueActionsSheet open onClose={() => setMenuEntryId(null)} entry={menuEntry} {...(onError ? { onError } : {})} />}
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
