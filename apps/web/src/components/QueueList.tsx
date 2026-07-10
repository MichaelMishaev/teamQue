import { useEffect, useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { QueueEntryView } from 'shared'
import { QueueRow } from '@/components/QueueRow'
import { QueueActionsSheet } from '@/components/QueueActionsSheet'
import { t } from '@/i18n'
import { useSessionActions } from '@/state/SessionActions'

/**
 * Single responsibility: the line — touch-first drag-to-reorder (dnd-kit,
 * handle-only listeners so the page still scrolls), front row gets the
 * accent "next" treatment, ⋯ opens QueueActionsSheet. Reorder is optimistic:
 * applied to local order immediately, reverted if SessionActions rejects it
 * (client-prd §5, US-030).
 */
export interface QueueListProps {
  queue: QueueEntryView[]
  onError?: (message: string) => void
}

export function QueueList({ queue, onError }: QueueListProps) {
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

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {orderedEntries.map((entry, i) => (
              <SortableQueueRow key={entry.id} entry={entry} index={i} isNext={i === 0} onMenu={() => setMenuEntryId(entry.id)} />
            ))}
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
  onMenu,
}: {
  entry: QueueEntryView
  index: number
  isNext: boolean
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
        next={isNext}
        dragging={isDragging}
        onMenu={onMenu}
        handleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}
