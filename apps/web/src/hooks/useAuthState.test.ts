import { act, renderHook, waitFor } from '@testing-library/react'
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

  it('moves to authed when GET /auth/me resolves', async () => {
    vi.mocked(apiGet).mockResolvedValue({ staffId: 's1' })
    const { result } = renderHook(() => useAuthState())
    await waitFor(() => expect(result.current.phase).toBe('authed'))
  })

  it('moves to needs-center on a 401 from GET /auth/me', async () => {
    vi.mocked(apiGet).mockRejectedValue(new ApiRequestError('UNAUTHORIZED', 'no cookie'))
    const { result } = renderHook(() => useAuthState())
    await waitFor(() => expect(result.current.phase).toBe('needs-center'))
  })

  it('onCenterUnlocked moves to needs-login, onLoggedIn moves to authed', async () => {
    vi.mocked(apiGet).mockRejectedValue(new ApiRequestError('UNAUTHORIZED', 'no cookie'))
    const { result } = renderHook(() => useAuthState())
    await waitFor(() => expect(result.current.phase).toBe('needs-center'))

    act(() => result.current.onCenterUnlocked())
    expect(result.current.phase).toBe('needs-login')

    act(() => result.current.onLoggedIn())
    expect(result.current.phase).toBe('authed')
  })
})
