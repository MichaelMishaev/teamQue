import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

function mockPublicLanding(courts: FieldListItem[]): void {
  mockApiPost.mockResolvedValueOnce({})
  mockApiGet.mockResolvedValueOnce(courts)
}

/** Open the create sheet and type a name into it. */
function typeNewCourtName(name: string): void {
  fireEvent.click(screen.getByRole('button', { name: t('home.create.action') }))
  fireEvent.change(screen.getByLabelText(t('home.create.nameLabel')), { target: { value: name } })
}

function exposeNativeInstallPrompt(): void {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => void
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  event.prompt = vi.fn()
  event.userChoice = Promise.resolve({ outcome: 'accepted' })
  act(() => window.dispatchEvent(event))
}

beforeEach(() => {
  resetHomeScreenOpenGuardForTests()
  mockApiGet.mockReset()
  mockApiPost.mockReset()
  mockNavigateToField.mockReset()
})

describe('HomeScreen', () => {
  it('renders supplied local-demo courts without loading from the API', () => {
    render(<HomeScreen initialCourts={[court({ slug: 'demo23' })]} />)

    expect(screen.getByText(DEFAULT_NAME)).toBeDefined()
    expect(mockApiGet).not.toHaveBeenCalled()
  })

  it('revokes remembered field access before loading the public field list', async () => {
    mockApiPost.mockResolvedValueOnce({})
    mockApiGet.mockResolvedValueOnce([court()])

    render(<HomeScreen />)

    expect(await screen.findByText(DEFAULT_NAME)).toBeDefined()
    expect(mockApiPost).toHaveBeenCalledWith('/fields/lock-all')
    expect(mockApiGet).toHaveBeenCalledWith('/fields/landing')
    expect(mockApiPost.mock.invocationCallOrder[0]).toBeLessThan(mockApiGet.mock.invocationCallOrder[0] ?? 0)
  })

  it('lists the active courts without navigating anywhere', async () => {
    mockPublicLanding([court()])
    render(<HomeScreen />)

    expect(await screen.findByText(DEFAULT_NAME)).toBeDefined()
    expect(screen.getByText(t('home.hero.title'))).toBeDefined()
    expect(screen.getByText(t('home.hero.meta'))).toBeDefined()
    expect(screen.getByRole('img', { name: t('home.hero.alt') })).toBeDefined()
    expect(screen.getByRole('button', { name: t('publicLine.qr.dialogLabel') })).toBeDefined()
    expect(mockNavigateToField).not.toHaveBeenCalled()
    expect(mockApiPost).toHaveBeenCalledTimes(1)
    expect(mockApiPost).toHaveBeenCalledWith('/fields/lock-all')
  })

  it('offers the native PWA install action from the manager home header', async () => {
    mockPublicLanding([court()])
    render(<HomeScreen />)
    await screen.findByText(DEFAULT_NAME)

    exposeNativeInstallPrompt()

    expect(screen.getByRole('button', { name: t('app.install') })).toBeDefined()
  })

  it('player-view button copies the public URL and shows the QR overlay instead of navigating', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    mockPublicLanding([court()])
    render(<HomeScreen />)

    fireEvent.click(await screen.findByRole('button', { name: t('publicLine.qr.dialogLabel') }))

    expect(screen.getByRole('dialog', { name: t('publicLine.qr.dialogLabel') })).toBeDefined()
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://line.maple-group.info/'))

    fireEvent.click(screen.getByRole('button', { name: t('publicLine.qr.back') }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not create a field when the public landing list is empty', async () => {
    mockPublicLanding([])
    render(<HomeScreen />)

    expect(await screen.findByText(t('home.empty.title'))).toBeDefined()
    expect(mockApiPost).toHaveBeenCalledTimes(1)
    expect(mockApiPost).toHaveBeenCalledWith('/fields/lock-all')
    expect(mockNavigateToField).not.toHaveBeenCalled()
  })

  it('pins the default court above newer courts', async () => {
    // GET /fields returns createdAt DESC, so the default arrives last.
    mockPublicLanding([
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
    mockPublicLanding([court({ slug: 'tap123' })])
    render(<HomeScreen />)

    fireEvent.click(await screen.findByRole('button', { name: new RegExp(DEFAULT_NAME) }))
    expect(mockNavigateToField).toHaveBeenCalledWith('tap123')
  })

  it('creates a court and goes straight into it', async () => {
    mockPublicLanding([court()])
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

  it('sends an optional four-digit password only when the creator entered one', async () => {
    mockPublicLanding([court()])
    mockApiPost.mockResolvedValueOnce({ slug: 'fresh1', snapshot: {} })
    render(<HomeScreen />)
    await screen.findByText(DEFAULT_NAME)

    typeNewCourtName('מגרש מוגן')
    fireEvent.change(screen.getByLabelText('סיסמה בת 4 ספרות (לא חובה)'), { target: { value: '4829' } })
    fireEvent.click(screen.getByRole('button', { name: t('home.create.submit') }))

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith('/fields', { name: 'מגרש מוגן', matchDurationSec: 360, password: '4829' }),
    )
  })

  it('creates a password-protected field in local demo mode without calling the API', async () => {
    const createDemoField = vi.fn().mockResolvedValue('demo24')
    render(<HomeScreen initialCourts={[court()]} createDemoField={createDemoField} />)

    typeNewCourtName('מגרש הדגמה')
    fireEvent.change(screen.getByLabelText('סיסמה בת 4 ספרות (לא חובה)'), { target: { value: '4829' } })
    fireEvent.click(screen.getByRole('button', { name: t('home.create.submit') }))

    await waitFor(() => expect(createDemoField).toHaveBeenCalledWith('מגרש הדגמה', '4829'))
    expect(mockApiPost).not.toHaveBeenCalled()
    expect(mockNavigateToField).toHaveBeenCalledWith('demo24')
  })

  it('shows a throttle error inline and keeps the sheet open', async () => {
    mockPublicLanding([court()])
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

  it('renders non-default fields without trying to create the default from the public screen', async () => {
    mockPublicLanding([court({ slug: 'other1', name: 'מגרש 2' })])
    render(<HomeScreen />)

    expect(await screen.findByText('מגרש 2')).toBeDefined()
    expect(mockApiPost).toHaveBeenCalledTimes(1)
    expect(mockApiPost).toHaveBeenCalledWith('/fields/lock-all')
    expect(screen.queryByRole('button', { name: t('publicLine.qr.dialogLabel') })).toBeNull()
  })

  it('shows an error when the court list fails to load', async () => {
    mockApiPost.mockResolvedValueOnce({})
    mockApiGet.mockRejectedValueOnce(new Error('network'))
    render(<HomeScreen />)

    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.getByText(t('home.load.error'))).toBeDefined()
  })

  it('fails closed without loading field cards when access revocation fails', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('network'))

    render(<HomeScreen />)

    expect(await screen.findByRole('alert')).toBeDefined()
    expect(mockApiGet).not.toHaveBeenCalled()
  })
})
