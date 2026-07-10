import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
import { createRealSessionActions, type SessionIdHandle } from './realSessionActions'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn() }
})

function sessionHandle(id: string | null = 's1'): SessionIdHandle {
  let current = id
  return { get: () => current, set: (next) => (current = next) }
}

beforeEach(() => {
  vi.mocked(apiGet).mockReset().mockResolvedValue([])
  vi.mocked(apiPost).mockReset().mockResolvedValue({})
  vi.mocked(apiPatch).mockReset().mockResolvedValue({})
  vi.mocked(apiDelete).mockReset().mockResolvedValue({ activityId: 'act-1' })
})

describe('realSessionActions', () => {
  it('addToLine POSTs the session id and an existing captain id as a bare string', async () => {
    const actions = createRealSessionActions(sessionHandle('s1'))
    await actions.addToLine({ id: 'cap-1' })
    expect(apiPost).toHaveBeenCalledWith('/sessions/s1/line', { team: 'cap-1' })
  })

  it('addToLine POSTs a {newName} ref as-is for a brand-new captain', async () => {
    const actions = createRealSessionActions(sessionHandle('s1'))
    await actions.addToLine({ newName: 'רועי' })
    expect(apiPost).toHaveBeenCalledWith('/sessions/s1/line', { team: { newName: 'רועי' } })
  })

  it('addToLine rejects synchronously when there is no active session', async () => {
    const actions = createRealSessionActions(sessionHandle(null))
    await expect(actions.addToLine({ id: 'cap-1' })).rejects.toThrow('no active session')
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('searchTeams GETs /captains?q= and skips the call for a blank query', async () => {
    vi.mocked(apiGet).mockResolvedValue([{ id: 'cap-1' }])
    const actions = createRealSessionActions(sessionHandle('s1'))

    const results = await actions.searchTeams('  ')
    expect(results).toEqual([])
    expect(apiGet).not.toHaveBeenCalled()

    await actions.searchTeams('רו')
    expect(apiGet).toHaveBeenCalledWith('/captains?q=%D7%A8%D7%95')
  })

  it('reorderLine PATCHes the session line with entryIds', async () => {
    const actions = createRealSessionActions(sessionHandle('s1'))
    await actions.reorderLine(['e1', 'e2'])
    expect(apiPatch).toHaveBeenCalledWith('/sessions/s1/line', { entryIds: ['e1', 'e2'] })
  })

  it('moveTop/moveBottom POST to their line-entry routes without needing a session id', async () => {
    const actions = createRealSessionActions(sessionHandle(null))
    await actions.moveTop('e1')
    expect(apiPost).toHaveBeenCalledWith('/line/e1/move-top')
    await actions.moveBottom('e2')
    expect(apiPost).toHaveBeenCalledWith('/line/e2/move-bottom')
  })

  it('removeFromLine DELETEs the entry and surfaces activityId for the undo toast', async () => {
    vi.mocked(apiDelete).mockResolvedValue({ activityId: 'act-42' })
    const actions = createRealSessionActions(sessionHandle('s1'))
    const result = await actions.removeFromLine('e1')
    expect(apiDelete).toHaveBeenCalledWith('/line/e1')
    expect(result).toEqual({ activityId: 'act-42' })
  })

  it('startMatch POSTs to the session start route, omitting entryIds when not given', async () => {
    const actions = createRealSessionActions(sessionHandle('s1'))
    await actions.startMatch()
    expect(apiPost).toHaveBeenCalledWith('/sessions/s1/start', {})
  })

  it('startMatch POSTs explicit entryIds when given', async () => {
    const actions = createRealSessionActions(sessionHandle('s1'))
    await actions.startMatch(['e1', 'e2'])
    expect(apiPost).toHaveBeenCalledWith('/sessions/s1/start', { entryIds: ['e1', 'e2'] })
  })

  it('pause/resume POST to their match routes', async () => {
    const actions = createRealSessionActions(sessionHandle('s1'))
    await actions.pause('m1')
    expect(apiPost).toHaveBeenCalledWith('/matches/m1/pause')
    await actions.resume('m1')
    expect(apiPost).toHaveBeenCalledWith('/matches/m1/resume')
  })

  it('finish POSTs to the finish route and surfaces activityId for the undo toast', async () => {
    vi.mocked(apiPost).mockResolvedValue({ match: { id: 'm1' }, activityId: 'act-7' })
    const actions = createRealSessionActions(sessionHandle('s1'))
    const result = await actions.finish('m1')
    expect(apiPost).toHaveBeenCalledWith('/matches/m1/finish')
    expect(result).toEqual({ activityId: 'act-7' })
  })

  it('extend POSTs a fixed 60s addSec (no duration input in the UI)', async () => {
    const actions = createRealSessionActions(sessionHandle('s1'))
    await actions.extend('m1')
    expect(apiPost).toHaveBeenCalledWith('/matches/m1/extend', { addSec: 60 })
  })

  it('replay POSTs to the replay route', async () => {
    const actions = createRealSessionActions(sessionHandle('s1'))
    await actions.replay('m1')
    expect(apiPost).toHaveBeenCalledWith('/matches/m1/replay')
  })

  it('undo POSTs to the undo route', async () => {
    const actions = createRealSessionActions(sessionHandle('s1'))
    await actions.undo('act-1')
    expect(apiPost).toHaveBeenCalledWith('/actions/act-1/undo')
  })

  it('openSession POSTs /sessions and stores the new session id in the handle', async () => {
    vi.mocked(apiPost).mockResolvedValue({ id: 's9' })
    const handle = sessionHandle(null)
    const actions = createRealSessionActions(handle)
    await actions.openSession({ matchDurationSec: 360 })
    expect(apiPost).toHaveBeenCalledWith('/sessions', { matchDurationSec: 360 })
    expect(handle.get()).toBe('s9')
  })

  it('closeSession POSTs the close route and clears the session id in the handle', async () => {
    const handle = sessionHandle('s1')
    const actions = createRealSessionActions(handle)
    await actions.closeSession()
    expect(apiPost).toHaveBeenCalledWith('/sessions/s1/close')
    expect(handle.get()).toBeNull()
  })

  it('updateDuration PATCHes the session', async () => {
    const actions = createRealSessionActions(sessionHandle('s1'))
    await actions.updateDuration(420)
    expect(apiPatch).toHaveBeenCalledWith('/sessions/s1', { matchDurationSec: 420 })
  })

  it('updateTeam PATCHes the captain with the given patch', async () => {
    const actions = createRealSessionActions(sessionHandle('s1'))
    await actions.updateTeam('cap-1', { nickname: 'הקטן', tags: ['x'], note: 'n' })
    expect(apiPatch).toHaveBeenCalledWith('/captains/cap-1', { nickname: 'הקטן', tags: ['x'], note: 'n' })
  })
})
