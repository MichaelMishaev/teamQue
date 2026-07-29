import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet, apiPost, ApiRequestError } from '@/lib/api'
import { useAuthState } from './useAuthState'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn() }
})

describe('useAuthState', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset()
    vi.mocked(apiPost).mockReset()
  })

  it('moves to authed without exposing the manager name when /auth/me confirms the device session', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      staff: { id: 's1', name: 'שרה', role: 'manager' },
      center: { id: 'c1', name: 'המרכז' },
    })
    const { result } = renderHook(() => useAuthState())
    await waitFor(() => expect(result.current.phase).toBe('authed'))
    expect(result.current.currentStaff?.id).toBe('s1')
    expect(result.current.currentStaff?.name).toBe('')
  })

  it('restores a trusted manager device without a staff picker or personal PIN', async () => {
    vi.mocked(apiGet).mockRejectedValue(new ApiRequestError('UNAUTHORIZED', 'no session cookie'))
    vi.mocked(apiPost).mockResolvedValue({ staffId: 's1', role: 'manager' })

    const { result } = renderHook(() => useAuthState())
    await waitFor(() => expect(result.current.phase).toBe('authed'))
    expect(apiPost).toHaveBeenCalledWith('/auth/device')
    expect(result.current.currentStaff).toEqual({ id: 's1', name: '', role: 'manager' })
  })

  it('starts the center PIN flow only when neither session nor trusted-device cookie is valid', async () => {
    vi.mocked(apiGet).mockRejectedValue(new ApiRequestError('UNAUTHORIZED', 'no session cookie'))
    vi.mocked(apiPost).mockRejectedValue(new ApiRequestError('UNAUTHORIZED', 'no center cookie'))

    const { result } = renderHook(() => useAuthState())
    await waitFor(() => expect(result.current.phase).toBe('needs-center'))
  })

  it('opens the manager app directly after a successful one-time center unlock', async () => {
    vi.mocked(apiGet).mockRejectedValue(new ApiRequestError('UNAUTHORIZED', 'no session cookie'))
    vi.mocked(apiPost)
      .mockRejectedValueOnce(new ApiRequestError('UNAUTHORIZED', 'no center cookie'))
      .mockResolvedValueOnce({ staffId: 's2', role: 'manager' })

    const { result } = renderHook(() => useAuthState())
    await waitFor(() => expect(result.current.phase).toBe('needs-center'))

    await act(async () => {
      await result.current.onCenterUnlocked()
    })

    expect(result.current.phase).toBe('authed')
    expect(result.current.currentStaff).toEqual({ id: 's2', name: '', role: 'manager' })
  })
})
