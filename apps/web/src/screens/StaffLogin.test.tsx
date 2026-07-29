import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet, apiPost } from '@/lib/api'
import { StaffLogin } from './StaffLogin'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn() }
})

describe('StaffLogin', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockResolvedValue([{ id: 's1', name: 'שרה' }])
    vi.mocked(apiPost).mockReset()
  })

  it('requires a staff selection and PIN before returning an identity', async () => {
    vi.mocked(apiPost).mockResolvedValue({ staffId: 's1', name: 'שרה', role: 'manager' })
    const onSuccess = vi.fn()
    render(<StaffLogin onSuccess={onSuccess} />)

    fireEvent.click(await screen.findByText('שרה'))
    for (const digit of ['1', '2', '3', '4']) fireEvent.click(screen.getByText(digit))

    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith({ id: 's1', name: 'שרה', role: 'manager' }),
    )
    expect(apiPost).toHaveBeenCalledWith('/auth/login', { staffId: 's1', pin: '1234' })
  })
})
