/**
 * Predicted pairing + estimated kickoff time for the waiting line — a display
 * projection only (queue_entries are never persisted as an A-vs-B pairing;
 * two entries pair into a match row only at kickoff, see the doc comment on
 * queueEntries in apps/api/src/db/schema.ts). Pure functions over the
 * current queue order, recomputed on every render — consistent with
 * lib/time.ts's "compute from timestamps, never tick" rule.
 */

/** Seconds staff want between one match ending and the next kicking off. */
export const MATCH_GAP_SEC = 60

export interface PairGroup {
  /** 0-based — how many full pairs play before this one. */
  pairIndex: number
  /** 1 or 2 queue entry ids, in queue order. */
  entryIds: string[]
  /** Equal to pairIndex — surfaced separately so callers don't recompute it. */
  gamesAhead: number
  /** Estimated seconds from now until this pair's match starts. */
  etaSec: number
  /** False for a trailing odd entry with no confirmed opponent yet. */
  hasPartner: boolean
}

/** Groups queue entry ids into consecutive pairs and estimates each pair's kickoff time. */
export function buildPairGroups(entryIds: string[], baseSec: number, matchDurationSec: number): PairGroup[] {
  const groups: PairGroup[] = []
  for (let i = 0; i < entryIds.length; i += 2) {
    const pairIndex = groups.length
    const ids = entryIds.slice(i, i + 2)
    groups.push({
      pairIndex,
      entryIds: ids,
      gamesAhead: pairIndex,
      etaSec: baseSec + pairIndex * (matchDurationSec + MATCH_GAP_SEC),
      hasPartner: ids.length === 2,
    })
  }
  return groups
}

/** baseSec input to buildPairGroups: 0 if the field is free, else the live match's remaining time plus the gap. */
export function computeBaseSec(isLive: boolean, liveRemainingSec: number): number {
  return isLive ? liveRemainingSec + MATCH_GAP_SEC : 0
}

/**
 * Moves the group at fromIndex to toIndex within the pair-group list, then
 * flattens the result back into a flat queue order — the reorderLine payload
 * after a pair-level drag-and-drop (docs/superpowers/specs/2026-07-13-queue-
 * pair-move-design.md).
 */
export function reorderGroups(groups: PairGroup[], fromIndex: number, toIndex: number): string[] {
  const reordered = [...groups]
  const [moved] = reordered.splice(fromIndex, 1)
  if (moved) reordered.splice(toIndex, 0, moved)
  return reordered.flatMap((g) => g.entryIds)
}

export interface RowSwitchPlan {
  fromIndex: number
  toIndex: number
  movedId: string
  direction: 'up' | 'down'
  occupantId: string | null
  shiftCount: number
}

/**
 * Pure decision logic for whether/how to gate a single-row drag
 * (docs/superpowers/specs/2026-07-15-row-switch-confirm-design.md) behind
 * confirmation — no DOM, no dnd-kit, so it's fully unit-testable even
 * though the drag mechanism that calls it (QueueList's handleDragEnd) is
 * not. Mirrors the pair-drag's magnitude/occupant math: moving an entry by
 * N slots always displaces exactly N others by one slot each — magnitude 1
 * is a genuine two-way swap (name both), anything more sets occupantId to
 * null and carries a count instead.
 */
export function planRowSwitch(orderIds: string[], oldIndex: number, newIndex: number): RowSwitchPlan | null {
  if (oldIndex === newIndex) return null
  const movedId = orderIds[oldIndex]
  if (movedId === undefined) return null
  const magnitude = Math.abs(newIndex - oldIndex)
  const occupantId = magnitude === 1 ? (orderIds[newIndex] ?? null) : null
  return {
    fromIndex: oldIndex,
    toIndex: newIndex,
    movedId,
    direction: newIndex < oldIndex ? 'up' : 'down',
    occupantId,
    shiftCount: magnitude,
  }
}
