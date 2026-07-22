import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@/i18n'
import { ApiRequestError, apiGet, apiPost } from '@/lib/api'
import { navigateToField } from '@/lib/route'
import type { FieldListItem } from 'shared'
import { HomeScreen, resetHomeScreenOpenGuardForTests } from './HomeScreen'

// importOriginal keeps the real ApiRequestError class — HomeScreen branches on
// `instanceof` to tell a throttle apart from a generic failure.
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn() }
})
vi.mock('@/lib/route', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/route')>()
  return { ...actual, navigateToField: vi.fn() }
})

const mockApiGet = vi.mocked(apiGet)
const mockApiPost = vi.mocked(apiPost)
const mockNavigateToField = vi.mocked(navigateToField)

const DEFAULT_NAME = t('home.create.nameDefault')

function court(overrides: Partial<FieldListItem> = {}): FieldListItem {
  return {
    slug: 'abc234',
    name: DEFAULT_NAME,
    createdAt: '2026-07-16T10:00:00.000Z',
    queueLength: 3,
    hasLiveMatch: true,
    ...overrides,
  }
}

/** Open the create sheet and type a name into it. */
function typeNewCourtName(name: string): void {
  fireEvent.click(screen.getByRole('button', { name: t('home.create.action') }))
  fireEvent.change(screen.getByLabelText(t('home.create.nameLabel')), { target: { value: name } })
}

beforeEach(() => {
  resetHomeScreenOpenGuardForTests()
  mockApiGet.mockReset()
  mockApiPost.mockReset()
  mockNavigateToField.mockReset()
})

describe('HomeScreen', () => {
  it('lists the active courts without navigating anywhere', async () => {
    mockApiGet.mockResolvedValueOnce([court()])
    render(<HomeScreen />)

    expect(await screen.findByText(DEFAULT_NAME)).toBeDefined()
    expect(screen.getByText(t('home.hero.title'))).toBeDefined()
    expect(screen.getByText(t('home.hero.meta'))).toBeDefined()
    expect(screen.getByRole('img', { name: t('home.hero.alt') })).toBeDefined()
    const playerView = screen.getByRole('link', { name: t('publicLine.openPlayerView.newWindow') })
    expect(playerView.getAttribute('href')).toBe('/line')
    expect(playerView.getAttribute('target')).toBe('_blank')
    expect(playerView.getAttribute('rel')).toContain('noopener')
    expect(mockNavigateToField).not.toHaveBeenCalled()
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it('creates the default court when no active court carries its name', async () => {
    mockApiGet.mockResolvedValueOnce([]).mockResolvedValueOnce([court({ slug: 'xyz789' })])
    mockApiPost.mockResolvedValueOnce({ slug: 'xyz789', snapshot: {} })
    render(<HomeScreen />)

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith('/fields', {
        name: DEFAULT_NAME,
        matchDurationSec: 360,
      }),
    )
    expect(await screen.findByText(DEFAULT_NAME)).toBeDefined()
    expect(mockNavigateToField).not.toHaveBeenCalled()
  })

  it('pins the default court above newer courts', async () => {
    // GET /fields returns createdAt DESC, so the default arrives last.
    mockApiGet.mockResolvedValueOnce([
      court({ slug: 'new111', name: 'מגרש 2', createdAt: '2026-07-17T10:00:00.000Z' }),
      court(),
    ])
    render(<HomeScreen />)

    await screen.findByText(DEFAULT_NAME)
    const names = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(names[0]).toContain(DEFAULT_NAME)
    expect(names[1]).toContain('מגרש 2')
  })

  it('opens a court when its row is tapped', async () => {
    mockApiGet.mockResolvedValueOnce([court({ slug: 'tap123' })])
    render(<HomeScreen />)

    fireEvent.click(await screen.findByRole('button', { name: new RegExp(DEFAULT_NAME) }))
    expect(mockNavigateToField).toHaveBeenCalledWith('tap123')
  })

  it('creates a court and goes straight into it', async () => {
    mockApiGet.mockResolvedValueOnce([court()])
    mockApiPost.mockResolvedValueOnce({ slug: 'fresh1', snapshot: {} })
    render(<HomeScreen />)
    await screen.findByText(DEFAULT_NAME)

    typeNewCourtName('מגרש 7')
    fireEvent.click(screen.getByRole('button', { name: t('home.create.submit') }))

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith('/fields', { name: 'מגרש 7', matchDurationSec: 360 }),
    )
    await waitFor(() => expect(mockNavigateToField).toHaveBeenCalledWith('fresh1'))
  })

  it('shows a throttle error inline and keeps the sheet open', async () => {
    mockApiGet.mockResolvedValueOnce([court()])
    mockApiPost.mockRejectedValueOnce(new ApiRequestError('RATE_LIMITED', 'too many'))
    render(<HomeScreen />)
    await screen.findByText(DEFAULT_NAME)

    typeNewCourtName('מגרש 7')
    fireEvent.click(screen.getByRole('button', { name: t('home.create.submit') }))

    expect(await screen.findByText(t('home.create.rateLimited'))).toBeDefined()
    expect(mockNavigateToField).not.toHaveBeenCalled()
    // sheet still open, typed name preserved so the retry costs nothing
    expect(screen.getByLabelText(t('home.create.nameLabel')).getAttribute('value')).toBe('מגרש 7')
  })

  it('still renders the existing courts when the default cannot be re-created', async () => {
    mockApiGet.mockResolvedValueOnce([court({ slug: 'other1', name: 'מגרש 2' })])
    mockApiPost.mockRejectedValueOnce(new ApiRequestError('RATE_LIMITED', 'too many'))
    render(<HomeScreen />)

    expect(await screen.findByText('מגרש 2')).toBeDefined()
    expect(screen.getByText(t('home.default.error'))).toBeDefined()
    expect(screen.queryByRole('link', { name: t('publicLine.openPlayerView.newWindow') })).toBeNull()
  })

  it('shows an error when the court list fails to load', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('network'))
    render(<HomeScreen />)

    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.getByText(t('home.load.error'))).toBeDefined()
  })
})
