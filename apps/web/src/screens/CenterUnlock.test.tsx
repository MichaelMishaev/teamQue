import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('submits four digits and advances only after a successful unlock', async () => {
    vi.mocked(apiPost).mockResolvedValue({})
    const onSuccess = vi.fn()
    render(<CenterUnlock onSuccess={onSuccess} />)

    for (const digit of ['1', '2', '3', '4']) fireEvent.click(screen.getByText(digit))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
    expect(apiPost).toHaveBeenCalledWith('/auth/center', { pin: '1234' })
  })

  it('stays locked and shows an inline error for a wrong PIN', async () => {
    let rejectRequest: ((reason: unknown) => void) | undefined
    vi.mocked(apiPost).mockImplementation(
      () => new Promise((_, reject) => {
        rejectRequest = reject
      }),
    )
    render(<CenterUnlock onSuccess={vi.fn()} />)

    for (const digit of ['1', '2', '3', '4']) fireEvent.click(screen.getByText(digit))
    await waitFor(() => expect(apiPost).toHaveBeenCalledOnce())
    act(() => {
      rejectRequest?.(new ApiRequestError('VALIDATION_FAILED', 'bad pin'))
    })

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
  })
})
