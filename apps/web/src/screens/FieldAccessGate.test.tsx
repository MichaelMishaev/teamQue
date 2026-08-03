import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet, apiPost } from '@/lib/api'
import { FieldAccessGate } from './FieldAccessGate'

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

describe('FieldAccessGate', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset()
    vi.mocked(apiPost).mockReset()
  })

  it('requires the four-digit password before mounting a protected field', async () => {
    vi.mocked(apiGet).mockResolvedValue({ passwordRequired: true, granted: false })
    vi.mocked(apiPost).mockResolvedValue({ ok: true })
    render(
      <FieldAccessGate slug="abc234">
        <p>field console</p>
      </FieldAccessGate>,
    )

    expect(await screen.findByText('מגרש מוגן')).toBeDefined()
    fireEvent.change(screen.getByLabelText('סיסמה בת 4 ספרות'), { target: { value: '4829' } })
    fireEvent.click(screen.getByRole('button', { name: 'כניסה למגרש' }))

    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/fields/abc234/access', { password: '4829' }))
    expect(await screen.findByText('field console')).toBeDefined()
  })

  it('keeps the field console hidden after a wrong password', async () => {
    vi.mocked(apiGet).mockResolvedValue({ passwordRequired: true, granted: false })
    vi.mocked(apiPost).mockRejectedValue(new Error('wrong password'))
    render(
      <FieldAccessGate slug="abc234">
        <p>field console</p>
      </FieldAccessGate>,
    )

    await screen.findByText('מגרש מוגן')
    fireEvent.change(screen.getByLabelText('סיסמה בת 4 ספרות'), { target: { value: '0000' } })
    fireEvent.click(screen.getByRole('button', { name: 'כניסה למגרש' }))

    expect((await screen.findByRole('alert')).textContent).toContain('הסיסמה שגויה')
    expect(screen.queryByText('field console')).toBeNull()
  })

  it('offers a way back to all fields before unlocking', async () => {
    vi.mocked(apiGet).mockResolvedValue({ passwordRequired: true, granted: false })
    render(
      <FieldAccessGate slug="abc234">
        <p>field console</p>
      </FieldAccessGate>,
    )

    expect((await screen.findByRole('link', { name: 'כל המגרשים' })).getAttribute('href')).toBe('/')
    expect(screen.getByText('חזרה לבחירת מגרש')).toBeDefined()
  })
})
