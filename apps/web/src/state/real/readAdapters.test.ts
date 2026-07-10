import { describe, expect, it } from 'vitest'
import type { ActivityEntry as WireActivityEntry, CaptainSearchResult, HistoryEntry } from 'shared'
import { toActivityEntry, toCaptainProfile, toFinishedMatchView } from './readAdapters'

const iso = '2026-07-10T18:42:00.000Z'

describe('toFinishedMatchView', () => {
  it('maps flat captain names into CaptainView objects and keeps the match fields', () => {
    const h: HistoryEntry = {
      id: 'm1',
      captainAId: 'a',
      captainAName: 'דניאל',
      captainBId: 'b',
      captainBName: 'נועם',
      fieldName: 'מגרש ראשי',
      startedAt: iso,
      endedAt: iso,
      endReason: 'auto',
      plannedDurationSec: 360,
      actualDurationSec: 400,
      startedByName: 'שרה',
      endedByName: null,
    }
    const v = toFinishedMatchView(h)
    expect(v.captainA.name).toBe('דניאל')
    expect(v.captainA.gamesToday).toBe(0)
    expect(v.fieldName).toBe('מגרש ראשי')
    expect(v.plannedDurationSec).toBe(360)
    expect(v.actualDurationSec).toBe(400)
    expect(v.endReason).toBe('auto')
    expect(v.startedByName).toBe('שרה')
  })

  it('passes a null field name through as empty', () => {
    const h: HistoryEntry = {
      id: 'm2',
      captainAId: 'a',
      captainAName: 'א',
      captainBId: 'b',
      captainBName: 'ב',
      fieldName: null,
      startedAt: iso,
      endedAt: iso,
      endReason: 'manual',
      plannedDurationSec: 360,
      actualDurationSec: 120,
      startedByName: null,
      endedByName: null,
    }
    expect(toFinishedMatchView(h).fieldName).toBe('')
  })
})

describe('toActivityEntry', () => {
  const base = { id: 'x', createdAt: iso, sessionId: 's', entityType: 'match', entityId: 'e', beforeJson: null, afterJson: null }
  const resolve = (id: string) => (id === 'staff-1' ? 'שרה' : null)

  it('maps a past-tense server action and resolves the staff name from the roster', () => {
    const e = toActivityEntry({ ...base, action: 'line.added', staffId: 'staff-1' } as WireActivityEntry, resolve)
    expect(e.action).toBe('line.addToLine')
    expect(e.staffName).toBe('שרה')
    expect(e.atIso).toBe(iso)
  })

  it('distinguishes automatic vs manual finish by null staffId', () => {
    expect(toActivityEntry({ ...base, action: 'match.finished', staffId: null } as WireActivityEntry, resolve).action).toBe(
      'match.finish.auto',
    )
    expect(
      toActivityEntry({ ...base, action: 'match.finished', staffId: 'staff-1' } as WireActivityEntry, resolve).action,
    ).toBe('match.finish.manual')
  })

  it('null staffId yields a null (automatic) staff name', () => {
    expect(toActivityEntry({ ...base, action: 'line.cleared', staffId: null } as WireActivityEntry, resolve).staffName).toBeNull()
  })

  it('falls back to a benign action for an unknown server action', () => {
    const e = toActivityEntry({ ...base, action: 'something.new', staffId: 'staff-1' } as WireActivityEntry, resolve)
    expect(e.action).toBe('team.update')
  })
})

describe('toCaptainProfile', () => {
  it('maps a search result, coalescing a null note to empty', () => {
    const c: CaptainSearchResult = {
      id: 'c1',
      name: 'דניאל',
      nickname: 'הקטן',
      gamesToday: 3,
      lastPlayedAt: iso,
      note: null,
      tags: ['קבוע'],
      totalMatches: 12,
    }
    const p = toCaptainProfile(c)
    expect(p.note).toBe('')
    expect(p.tags).toEqual(['קבוע'])
    expect(p.totalMatches).toBe(12)
  })
})
