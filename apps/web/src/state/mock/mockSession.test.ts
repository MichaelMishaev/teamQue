import { describe, expect, it } from 'vitest'
import { createMockSession, type MockSessionInstance } from './mockSession'

function lineEntryIds(session: MockSessionInstance): string[] {
  const snap = session.getSnapshotState().snapshot
  return snap ? snap.queue.map((e) => e.id) : []
}

describe('mockSession seed', () => {
  it('starts with an active session, one live match, and a 5-deep line of single teams', () => {
    const session = createMockSession()
    const snap = session.getSnapshotState().snapshot
    expect(snap).not.toBeNull()
    expect(snap?.session.status).toBe('active')
    expect(snap?.fields[0]?.liveMatch).not.toBeNull()
    expect(snap?.queue).toHaveLength(5)
    expect(snap?.queue.map((e) => e.position)).toEqual([1, 2, 3, 4, 5])
    // each line row is ONE team, not a pair
    expect(snap?.queue.every((e) => typeof e.team.name === 'string')).toBe(true)
  })

  it('seeds 12 captains including two דניאל distinguished by nickname', () => {
    const session = createMockSession()
    const daniels = session.getCaptainsState().filter((c) => c.name === 'דניאל')
    expect(session.getCaptainsState()).toHaveLength(12)
    expect(daniels).toHaveLength(2)
    expect(daniels.some((c) => c.nickname === 'הקטן')).toBe(true)
  })
})

describe('mockSession addToLine', () => {
  it('appends one team to the back of the line', async () => {
    const session = createMockSession()
    const before = lineEntryIds(session)
    await session.actions.addToLine({ newName: 'רועי' })
    const after = lineEntryIds(session)
    expect(after).toHaveLength(before.length + 1)
    expect(after.slice(0, before.length)).toEqual(before)

    const snap = session.getSnapshotState().snapshot!
    const added = snap.queue.at(-1)!
    expect(added.team.name).toBe('רועי')
    expect(added.position).toBe(snap.queue.length)
  })

  it('creates a captain that is then findable by search', async () => {
    const session = createMockSession()
    await session.actions.addToLine({ newName: 'רועי' })
    const hits = await session.actions.searchTeams('רועי')
    expect(hits.some((c) => c.name === 'רועי')).toBe(true)
  })
})

describe('mockSession reorderLine / moveTop / moveBottom', () => {
  it('applies a new order optimistically-safe (positions renumbered 1..n)', async () => {
    const session = createMockSession()
    const ids = lineEntryIds(session)
    const reversed = [...ids].reverse()
    await session.actions.reorderLine(reversed)
    expect(lineEntryIds(session)).toEqual(reversed)
    const snap = session.getSnapshotState().snapshot!
    expect(snap.queue.map((e) => e.position)).toEqual(ids.map((_, i) => i + 1))
  })

  it('rejects when the test seam is set, leaving the line untouched', async () => {
    const session = createMockSession()
    const ids = lineEntryIds(session)
    session.setReorderRejects(true)
    await expect(session.actions.reorderLine([...ids].reverse())).rejects.toThrow()
    expect(lineEntryIds(session)).toEqual(ids)
  })

  it('moveTop brings an entry to the front', async () => {
    const session = createMockSession()
    const ids = lineEntryIds(session)
    const target = ids[2]!
    await session.actions.moveTop(target)
    expect(lineEntryIds(session)[0]).toBe(target)
  })

  it('moveBottom sends an entry to the back', async () => {
    const session = createMockSession()
    const ids = lineEntryIds(session)
    const target = ids[0]!
    await session.actions.moveBottom(target)
    expect(lineEntryIds(session).at(-1)).toBe(target)
  })
})

describe('mockSession finish + undo', () => {
  it('finish moves the live match to history and frees the field', async () => {
    const session = createMockSession()
    const liveId = session.getSnapshotState().snapshot!.fields[0]!.liveMatch!.id
    const { activityId } = await session.actions.finish(liveId)
    expect(activityId).toBeTruthy()

    const snap = session.getSnapshotState().snapshot!
    expect(snap.fields[0]?.liveMatch).toBeNull()

    const history = session.getHistoryState()
    expect(history.matches.some((m) => m.id === liveId)).toBe(true)
  })

  it('undo after finish restores the match as the live match', async () => {
    const session = createMockSession()
    const liveId = session.getSnapshotState().snapshot!.fields[0]!.liveMatch!.id
    const { activityId } = await session.actions.finish(liveId)

    await session.actions.undo(activityId)

    const snap = session.getSnapshotState().snapshot!
    expect(snap.fields[0]?.liveMatch?.id).toBe(liveId)
    expect(session.getHistoryState().matches.some((m) => m.id === liveId)).toBe(false)
  })

  it('undo after removeFromLine restores the entry to the line at its original position', async () => {
    const session = createMockSession()
    const ids = lineEntryIds(session)
    const removedId = ids[1]!
    const { activityId } = await session.actions.removeFromLine(removedId)
    expect(lineEntryIds(session)).not.toContain(removedId)

    await session.actions.undo(activityId)
    expect(lineEntryIds(session)).toEqual(ids)
  })

  it('undo rejects once the activity has already been consumed', async () => {
    const session = createMockSession()
    const ids = lineEntryIds(session)
    const { activityId } = await session.actions.removeFromLine(ids[0]!)
    await session.actions.undo(activityId)
    await expect(session.actions.undo(activityId)).rejects.toThrow()
  })

  it('undo of a finish rejects gracefully when a new match already took the field', async () => {
    const session = createMockSession()
    const liveId = session.getSnapshotState().snapshot!.fields[0]!.liveMatch!.id
    const { activityId } = await session.actions.finish(liveId)

    await session.actions.startMatch()

    await expect(session.actions.undo(activityId)).rejects.toThrow()
  })
})

describe('mockSession startMatch', () => {
  it('rejects starting a match while the field is occupied', async () => {
    const session = createMockSession()
    await expect(session.actions.startMatch()).rejects.toThrow()
  })

  it('pairs the front two line entries and removes both from the line once the field is free', async () => {
    const session = createMockSession()
    const liveId = session.getSnapshotState().snapshot!.fields[0]!.liveMatch!.id
    await session.actions.finish(liveId)

    const before = lineEntryIds(session)
    const [frontId, secondId] = before

    await session.actions.startMatch()

    const snap = session.getSnapshotState().snapshot!
    expect(snap.fields[0]?.liveMatch).not.toBeNull()
    expect(lineEntryIds(session)).not.toContain(frontId)
    expect(lineEntryIds(session)).not.toContain(secondId)
    expect(lineEntryIds(session)).toHaveLength(before.length - 2)
  })

  it('rejects starting a match when fewer than two teams remain in the line', async () => {
    const session = createMockSession()
    const liveId = session.getSnapshotState().snapshot!.fields[0]!.liveMatch!.id
    await session.actions.finish(liveId)
    // drain the line down to one entry
    const ids = lineEntryIds(session)
    for (const id of ids.slice(0, ids.length - 1)) {
      await session.actions.removeFromLine(id)
    }
    expect(lineEntryIds(session)).toHaveLength(1)
    await expect(session.actions.startMatch()).rejects.toThrow()
  })
})

describe('mockSession replay', () => {
  it('re-adds both of a finished match teams to the back of the line', async () => {
    const session = createMockSession()
    const history = session.getHistoryState()
    const finished = history.matches[0]!
    const before = lineEntryIds(session)

    await session.actions.replay(finished.id)

    const after = lineEntryIds(session)
    expect(after).toHaveLength(before.length + 2)
    const snap = session.getSnapshotState().snapshot!
    const [secondLast, last] = snap.queue.slice(-2)
    expect(secondLast!.team.name).toBe(finished.captainA.name)
    expect(last!.team.name).toBe(finished.captainB.name)
  })
})
