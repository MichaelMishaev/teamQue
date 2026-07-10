import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet, apiPost, ApiRequestError } from '@/lib/api'
import { StaffLogin } from './StaffLogin'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn() }
})

const staffList = [
  { id: 's1', name: 'שרה' },
  { id: 's2', name: 'דניאל' },
]

describe('StaffLogin', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset()
    vi.mocked(apiPost).mockReset()
    vi.mocked(apiGet).mockResolvedValue(staffList)
  })

  it('happy: picks a staff chip, enters the pin, and calls onSuccess', async () => {
    vi.mocked(apiPost).mockResolvedValue({})
    const onSuccess = vi.fn()
    render(<StaffLogin onSuccess={onSuccess} />)

    const chip = await screen.findByText('שרה')
    fireEvent.click(chip)

    fireEvent.click(screen.getByText('1'))
    fireEvent.click(screen.getByText('2'))
    fireEvent.click(screen.getByText('3'))
    fireEvent.click(screen.getByText('4'))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(apiPost).toHaveBeenCalledWith('/auth/login', { staffId: 's1', pin: '1234' })
  })

  it('wrong-pin: shows an inline error and clears the dots for a fresh attempt', async () => {
    vi.mocked(apiPost)
      .mockRejectedValueOnce(new ApiRequestError('VALIDATION_FAILED', 'bad pin'))
      .mockResolvedValueOnce({})
    const onSuccess = vi.fn()
    render(<StaffLogin onSuccess={onSuccess} />)

    const chip = await screen.findByText('שרה')
    fireEvent.click(chip)

    fireEvent.click(screen.getByText('1'))
    fireEvent.click(screen.getByText('2'))
    fireEvent.click(screen.getByText('3'))
    fireEvent.click(screen.getByText('4'))

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())

    fireEvent.click(screen.getByText('5'))
    fireEvent.click(screen.getByText('6'))
    fireEvent.click(screen.getByText('7'))
    fireEvent.click(screen.getByText('8'))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(apiPost).toHaveBeenCalledTimes(2)
    expect(apiPost).toHaveBeenLastCalledWith('/auth/login', { staffId: 's1', pin: '5678' })
  })

  it('locked: a PIN_LOCKED response drives the PinPad lockout countdown from retryAfterSec', async () => {
    vi.mocked(apiPost).mockRejectedValue(
      new ApiRequestError('PIN_LOCKED', 'locked', { retryAfterSec: 47 }),
    )
    render(<StaffLogin onSuccess={vi.fn()} />)

    const chip = await screen.findByText('שרה')
    fireEvent.click(chip)

    fireEvent.click(screen.getByText('1'))
    fireEvent.click(screen.getByText('2'))
    fireEvent.click(screen.getByText('3'))
    fireEvent.click(screen.getByText('4'))

    await waitFor(() => expect(screen.getByText(/00:47/)).toBeDefined())
    expect(screen.queryByText('7')).toBeNull()
  })
})
