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
