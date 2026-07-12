import { useEffect, useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { QueueEntryView } from 'shared'
import { QueuePairGroup, type QueuePairGroupVariant } from '@/components/QueuePairGroup'
import { QueueRow } from '@/components/QueueRow'
import { QueueActionsSheet } from '@/components/QueueActionsSheet'
import { t } from '@/i18n'
import { buildPairGroups } from '@/lib/queue-pairing'
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
 */
export interface QueueListProps {
  queue: QueueEntryView[]
  matchDurationSec: number
  baseSec: number
  onError?: (message: string) => void
}

export function QueueList({ queue, matchDurationSec, baseSec, onError }: QueueListProps) {
  const actions = useSessionActions()
  const [orderIds, setOrderIds] = useState<string[]>(() => queue.map((e) => e.id))
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null)

  useEffect(() => {
    setOrderIds(queue.map((e) => e.id))
  }, [queue])

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

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-4">
            {pairGroups.map((group) => {
              const isNext = group.pairIndex === 0 && group.hasPartner
              const variant: QueuePairGroupVariant = isNext ? 'next' : group.hasPartner ? 'default' : 'solo'
              const label = isNext
                ? t('queue.pair.next', { index: group.pairIndex + 1 })
                : group.hasPartner
                  ? t('queue.pair.label', { index: group.pairIndex + 1 })
                  : t('queue.pair.waiting')
              return (
                <QueuePairGroup key={group.pairIndex} label={label} variant={variant}>
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
                        {...(!isNext ? { gamesAhead: group.gamesAhead, etaSec: group.etaSec } : {})}
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
