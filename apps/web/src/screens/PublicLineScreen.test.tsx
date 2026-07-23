import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FieldListItem, SessionSnapshot } from 'shared'
import { apiGet, apiPost } from '@/lib/api'
import { createSessionSocket, type CreateSessionSocketOptions } from '@/lib/socket'
import { t } from '@/i18n'
import { PublicLineScreen } from './PublicLineScreen'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn().mockResolvedValue({ recorded: true }) }
})

vi.mock('@/lib/socket', () => ({ createSessionSocket: vi.fn() }))

const mockApiGet = vi.mocked(apiGet)
const mockApiPost = vi.mocked(apiPost)
const mockCreateSessionSocket = vi.mocked(createSessionSocket)
const mockShare = vi.fn<Navigator['share']>()
const mockWriteText = vi.fn<(text: string) => Promise<void>>()
let socketOptions: CreateSessionSocketOptions | null = null

function installMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  })
}

function captain(id: string, name: string, gamesToday = 0, lastPlayedAt: string | null = null) {
  return { id, name, nickname: null, gamesToday, lastPlayedAt }
}

function snapshot(queueNames = ['גיא', 'נועם', 'דניאל', 'איתי', 'עומר']): SessionSnapshot {
  const now = Date.now()
  return {
    session: {
      id: 'session-1',
      slug: 'abc234',
      date: '2026-07-22',
      location: null,
      matchDurationSec: 360,
      status: 'active',
    },
    fields: [
      {
        id: 'field-1',
        name: t('home.create.nameDefault'),
        position: 0,
        liveMatch: {
          id: 'match-1',
          captainA: captain('playing-1', 'רועי', 2),
          captainB: captain('playing-2', 'אדם', 1),
          status: 'live',
          plannedDurationSec: 360,
          startedAt: new Date(now - 120_000).toISOString(),
          pausedAt: null,
          accumulatedPauseSec: 0,
          endsAt: new Date(now + 240_000).toISOString(),
        },
      },
    ],
    queue: queueNames.map((name, index) => ({
      id: `entry-${index + 1}`,
      position: index + 1,
      team: captain(`captain-${index + 1}`, name, index % 3, index === 2 ? new Date(now - 3_600_000).toISOString() : null),
    })),
    emittedAt: new Date(now).toISOString(),
    serverNow: new Date(now).toISOString(),
  }
}

function defaultCourt(): FieldListItem {
  return {
    slug: 'abc234',
    name: t('home.create.nameDefault'),
    createdAt: '2026-07-22T12:00:00.000Z',
    queueLength: 5,
    hasLiveMatch: true,
  }
}

beforeEach(() => {
  socketOptions = null
  mockApiGet.mockReset()
  mockApiPost.mockReset().mockResolvedValue({ recorded: true })
  mockShare.mockReset().mockResolvedValue(undefined)
  mockWriteText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'share', { configurable: true, value: mockShare })
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mockWriteText },
  })
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: { saveData: false },
  })
  installMatchMedia(false)
  mockCreateSessionSocket.mockReset()
  mockCreateSessionSocket.mockImplementation((options) => {
    socketOptions = options
    return { disconnect: vi.fn() }
  })
})

describe('PublicLineScreen', () => {
  it('shows the live pair, every waiting pair, positions, and times from the default court', async () => {
    mockApiGet.mockResolvedValueOnce([defaultCourt()]).mockResolvedValueOnce(snapshot())

    render(<PublicLineScreen />)

    expect(await screen.findByRole('heading', { name: t('publicLine.title') })).toBeDefined()
    const background = screen.getByTestId('public-line-kids-background')
    expect(background.getAttribute('aria-hidden')).toBe('true')
    expect(background.getAttribute('style')).toContain('/media/public-line-kids-background.webp')
    expect(screen.getByText(t('home.create.nameDefault'))).toBeDefined()
    expect(screen.getByText('רועי')).toBeDefined()
    expect(screen.getByText('אדם')).toBeDefined()
    for (const name of ['גיא', 'נועם', 'דניאל', 'איתי', 'עומר']) {
      expect(screen.getByText(name)).toBeDefined()
    }
    expect(screen.getByText(t('publicLine.pair.gamesAheadOne'))).toBeDefined()
    expect(screen.getByText(t('publicLine.pair.gamesAheadMany', { count: 2 }))).toBeDefined()
    expect(screen.getByText(t('publicLine.pair.gamesAheadMany', { count: 3 }))).toBeDefined()
    expect(screen.getAllByText(t('publicLine.pair.etaApproxPrefix'))).toHaveLength(3)
    expect(screen.getAllByText(t('publicLine.pair.estimatedAt'))).toHaveLength(3)
    expect(screen.getByText(t('publicLine.pair.waitingForOpponent'))).toBeDefined()
    expect(screen.getAllByText(/^#\d$/)).toHaveLength(5)
    expect(screen.queryByText(/משחקים היום/)).toBeNull()

    expect(mockApiGet).toHaveBeenNthCalledWith(1, '/fields')
    expect(mockApiGet).toHaveBeenNthCalledWith(2, '/fields/abc234')
    await waitFor(() =>
      expect(mockCreateSessionSocket).toHaveBeenCalledWith(expect.objectContaining({ slug: 'abc234' })),
    )
  })

  it('plays the silent decorative match atmosphere behind a live match', async () => {
    mockApiGet.mockResolvedValueOnce([defaultCourt()]).mockResolvedValueOnce(snapshot())

    render(<PublicLineScreen />)

    const video = await screen.findByTestId('public-line-match-atmosphere')
    expect(video.getAttribute('aria-hidden')).toBe('true')
    expect(video.hasAttribute('autoplay')).toBe(true)
    expect(video.hasAttribute('loop')).toBe(true)
    expect((video as HTMLVideoElement).muted).toBe(true)
    expect(video.hasAttribute('playsinline')).toBe(true)
    expect(video.querySelector('source')?.getAttribute('src')).toBe('/media/public-line-match-atmosphere.mp4')
  })

  it('keeps the live match card still when reduced motion is requested', async () => {
    installMatchMedia(true)
    mockApiGet.mockResolvedValueOnce([defaultCourt()]).mockResolvedValueOnce(snapshot())

    render(<PublicLineScreen />)

    await screen.findByText('רועי')
    expect(screen.queryByTestId('public-line-match-atmosphere')).toBeNull()
  })

  it('is operationally read-only and replaces the snapshot from realtime updates', async () => {
    mockApiGet.mockResolvedValueOnce([defaultCourt()]).mockResolvedValueOnce(snapshot(['גיא', 'נועם']))
    render(<PublicLineScreen />)

    await screen.findByText('גיא')
    expect(screen.getByRole('button', { name: t('publicLine.share') })).toBeDefined()
    expect(screen.queryByText(t('action.start'))).toBeNull()
    expect(screen.queryByText(t('queue.remove'))).toBeNull()
    const managerLinks = screen.queryAllByRole('link').filter((link) => {
      const href = link.getAttribute('href')
      return href === '/' || href?.startsWith('/f/') === true
    })
    expect(managerLinks).toHaveLength(0)

    const options = socketOptions
    if (options === null) throw new Error('socket did not connect')
    act(() => {
      options.onSnapshot(snapshot(['מאיה', 'שירה']))
    })

    expect(screen.getByText('מאיה')).toBeDefined()
    expect(screen.getByText('שירה')).toBeDefined()
    expect(screen.queryByText('גיא')).toBeNull()
  })

  it('shows a useful empty state when the Independence Square court is unavailable', async () => {
    mockApiGet.mockResolvedValueOnce([])
    render(<PublicLineScreen />)

    expect((await screen.findByRole('alert')).textContent).toBe(t('publicLine.unavailable'))
    await waitFor(() => expect(mockCreateSessionSocket).not.toHaveBeenCalled())
  })

  it('opens the native share sheet with the canonical public-line URL', async () => {
    mockApiGet.mockResolvedValueOnce([])
    render(<PublicLineScreen />)

    fireEvent.click(screen.getByRole('button', { name: t('publicLine.share') }))

    await waitFor(() =>
      expect(mockShare).toHaveBeenCalledWith({
        title: t('publicLine.share.title'),
        text: t('publicLine.share.text'),
        url: `${window.location.origin}/line`,
      }),
    )
    expect(mockWriteText).not.toHaveBeenCalled()
  })

  it('copies the canonical link and confirms success when native sharing is unavailable', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    mockApiGet.mockResolvedValueOnce([])
    render(<PublicLineScreen />)

    fireEvent.click(screen.getByRole('button', { name: t('publicLine.share') }))

    await waitFor(() => expect(mockWriteText).toHaveBeenCalledWith(`${window.location.origin}/line`))
    expect(screen.getByRole('button', { name: t('publicLine.share.copied') })).toBeDefined()
  })
})
