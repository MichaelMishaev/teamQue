import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@/i18n'
import { apiGet, apiPost } from '@/lib/api'
import { navigateToField } from '@/lib/route'
import { HomeScreen } from './HomeScreen'

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))
vi.mock('@/lib/route', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/route')>()
  return { ...actual, navigateToField: vi.fn() }
})

const mockApiGet = vi.mocked(apiGet)
const mockApiPost = vi.mocked(apiPost)
const mockNavigateToField = vi.mocked(navigateToField)

describe('HomeScreen', () => {
  it('lists active fields with queue count and live badge', async () => {
    mockApiGet.mockResolvedValueOnce([
      { slug: 'abc234', name: 'מגרש בית ספר', createdAt: '2026-07-16T10:00:00.000Z', queueLength: 3, hasLiveMatch: true },
    ])
    render(<HomeScreen />)
    expect(await screen.findByText('מגרש בית ספר')).toBeDefined()
    expect(screen.getByText(t('home.list.live'))).toBeDefined()
  })

  it('empty list shows the empty state', async () => {
    mockApiGet.mockResolvedValueOnce([])
    render(<HomeScreen />)
    expect(await screen.findByText(t('home.list.empty'))).toBeDefined()
  })

  it('create flow POSTs name+duration and navigates to the new slug', async () => {
    mockApiGet.mockResolvedValueOnce([])
    mockApiPost.mockResolvedValueOnce({ slug: 'xyz789', snapshot: {} })
    render(<HomeScreen />)

    fireEvent.click(await screen.findByRole('button', { name: t('home.create.cta') }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'המגרש שלי' } })
    fireEvent.click(screen.getByRole('button', { name: t('home.create.open') }))

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('/fields', { name: 'המגרש שלי', matchDurationSec: 360 }))
    await waitFor(() => expect(mockNavigateToField).toHaveBeenCalledWith('xyz789'))
  })
})
