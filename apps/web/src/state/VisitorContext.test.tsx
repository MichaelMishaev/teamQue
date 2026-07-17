import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet, apiPost, ApiRequestError } from '@/lib/api'
import type { SessionActions } from '@/state/SessionActions'
import { gateActions, useVisitor, VisitorProvider } from './VisitorContext'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn() }
})

const mockApiGet = vi.mocked(apiGet)
const mockApiPost = vi.mocked(apiPost)

function renderVisitorHook() {
  return renderHook(() => useVisitor(), { wrapper: VisitorProvider })
}

/** Every SessionActions method as a vi.fn(), for gateActions wrapping tests. */
type FakeSessionActions = { [K in keyof SessionActions]: ReturnType<typeof vi.fn> }

function fakeSessionActions(): FakeSessionActions {
  return {
    addToLine: vi.fn().mockResolvedValue(undefined),
    searchTeams: vi.fn().mockResolvedValue([]),
    reorderLine: vi.fn().mockResolvedValue(undefined),
    moveTop: vi.fn().mockResolvedValue(undefined),
    moveBottom: vi.fn().mockResolvedValue(undefined),
    removeFromLine: vi.fn().mockResolvedValue({ activityId: 'a1' }),
    startMatch: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    finish: vi.fn().mockResolvedValue({ activityId: 'a2' }),
    extend: vi.fn().mockResolvedValue(undefined),
    replay: vi.fn().mockResolvedValue(undefined),
    undo: vi.fn().mockResolvedValue(undefined),
    openSession: vi.fn().mockResolvedValue(undefined),
    closeSession: vi.fn().mockResolvedValue(undefined),
    updateDuration: vi.fn().mockResolvedValue(undefined),
    updateTeam: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  mockApiGet.mockReset()
  mockApiPost.mockReset()
})

describe('VisitorContext', () => {
  it('resolves ensureVisitor immediately when GET /visitors/me succeeds', async () => {
    mockApiGet.mockResolvedValueOnce({ visitorId: 'v1', nickname: 'דנה' })
    const { result } = renderVisitorHook()
    await waitFor(() => expect(result.current.nickname).toBe('דנה'))
    await expect(result.current.ensureVisitor()).resolves.toBe(true)
  })

  it('auto-registers a suggested nickname when no identity — no popup', async () => {
    mockApiGet.mockRejectedValueOnce(new ApiRequestError('NOT_FOUND', 'none'))
    mockApiPost.mockResolvedValueOnce({ visitorId: 'v2', nickname: 'אורח 42' })
    const { result } = renderVisitorHook()
    await act(async () => {
      await expect(result.current.ensureVisitor()).resolves.toBe(true)
    })
    expect(mockApiPost).toHaveBeenCalledWith('/visitors', {
      nickname: expect.stringMatching(/^אורח \d+$/),
    })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('gateActions calls ensureVisitor before a mutation and skips it for searchTeams', async () => {
    const ensure = vi.fn().mockResolvedValue(true)
    const inner = fakeSessionActions()
    const gated = gateActions(inner, ensure)
    await gated.addToLine({ newName: 'קבוצה' })
    expect(ensure).toHaveBeenCalledTimes(1)
    expect(inner.addToLine).toHaveBeenCalled()
    await gated.searchTeams('ק')
    expect(ensure).toHaveBeenCalledTimes(1)
  })

  it('gateActions rejects without calling the API when ensureVisitor returns false', async () => {
    const ensure = vi.fn().mockResolvedValue(false)
    const inner = fakeSessionActions()
    const gated = gateActions(inner, ensure)
    await expect(gated.startMatch()).rejects.toThrow()
    expect(inner.startMatch).not.toHaveBeenCalled()
  })
})
