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

  it('moves to authed when /auth/me confirms staff identity', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      staff: { id: 's1', name: 'שרה', role: 'manager' },
      center: { id: 'c1', name: 'המרכז' },
    })
    const { result } = renderHook(() => useAuthState())
    await waitFor(() => expect(result.current.phase).toBe('authed'))
    expect(result.current.currentStaff?.id).toBe('s1')
  })

  it('starts the center PIN flow when /auth/me rejects anonymous access', async () => {
    vi.mocked(apiGet).mockRejectedValue(new ApiRequestError('UNAUTHORIZED', 'no cookie'))
    const { result } = renderHook(() => useAuthState())
    await waitFor(() => expect(result.current.phase).toBe('needs-center'))

    act(() => result.current.onCenterUnlocked())
    expect(result.current.phase).toBe('needs-login')

    act(() => result.current.onLoggedIn({ id: 's2', name: 'משה', role: 'staff' }))
    expect(result.current.phase).toBe('authed')
    expect(result.current.currentStaff?.id).toBe('s2')
  })
})
