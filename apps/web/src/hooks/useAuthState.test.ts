import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet, ApiRequestError } from '@/lib/api'
import { useAuthState } from './useAuthState'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, apiGet: vi.fn() }
})

describe('useAuthState', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset()
  })

  it('starts in loading', () => {
    vi.mocked(apiGet).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useAuthState())
    expect(result.current.phase).toBe('loading')
  })

  it('moves to authed when GET /auth/me resolves, seeding currentStaff from it', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      staff: { id: 's1', name: 'שרה', role: 'manager' },
      center: { id: 'c1', name: 'המרכז' },
    })
    const { result } = renderHook(() => useAuthState())
    await waitFor(() => expect(result.current.phase).toBe('authed'))
    expect(result.current.currentStaff).toEqual({ id: 's1', name: 'שרה', role: 'manager' })
  })

  it('moves to error when GET /auth/me fails (e.g. network error)', async () => {
    vi.mocked(apiGet).mockRejectedValue(new ApiRequestError('VALIDATION_FAILED', 'Network request failed'))
    const { result } = renderHook(() => useAuthState())
    await waitFor(() => expect(result.current.phase).toBe('error'))
    expect(result.current.currentStaff).toBeNull()
  })
})
