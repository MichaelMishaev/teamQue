import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiPost, ApiRequestError } from '@/lib/api'
import { CenterUnlock } from './CenterUnlock'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, apiPost: vi.fn() }
})

describe('CenterUnlock', () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset()
  })

  it('happy: submits the 4-digit pin and calls onSuccess', async () => {
    vi.mocked(apiPost).mockResolvedValue({})
    const onSuccess = vi.fn()
    render(<CenterUnlock onSuccess={onSuccess} />)

    fireEvent.click(screen.getByText('1'))
    fireEvent.click(screen.getByText('2'))
    fireEvent.click(screen.getByText('3'))
    fireEvent.click(screen.getByText('4'))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(apiPost).toHaveBeenCalledWith('/auth/center', { pin: '1234' })
  })

  it('wrong-pin: shows an inline error and clears the dots for a fresh attempt', async () => {
    vi.mocked(apiPost)
      .mockRejectedValueOnce(new ApiRequestError('VALIDATION_FAILED', 'bad pin'))
      .mockResolvedValueOnce({})
    const onSuccess = vi.fn()
    render(<CenterUnlock onSuccess={onSuccess} />)

    fireEvent.click(screen.getByText('1'))
    fireEvent.click(screen.getByText('2'))
    fireEvent.click(screen.getByText('3'))
    fireEvent.click(screen.getByText('4'))

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect(onSuccess).not.toHaveBeenCalled()

    // dots must have been cleared: a fresh 4-digit run resubmits exactly once more
    fireEvent.click(screen.getByText('5'))
    fireEvent.click(screen.getByText('6'))
    fireEvent.click(screen.getByText('7'))
    fireEvent.click(screen.getByText('8'))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(apiPost).toHaveBeenCalledTimes(2)
    expect(apiPost).toHaveBeenLastCalledWith('/auth/center', { pin: '5678' })
  })
})
