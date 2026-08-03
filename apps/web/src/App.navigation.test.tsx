import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { showStatusToast } from '@/components/UndoToast'
import { DemoProviders } from '@/state/mock/DemoProviders'

vi.mock('@/components/UndoToast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/UndoToast')>()),
  showStatusToast: vi.fn(),
}))

function fakeLocalStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}

function renderApp(fieldName?: string) {
  render(
    <DemoProviders fieldName={fieldName}>
      <App slug="abc234" />
    </DemoProviders>,
  )
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

describe('App top-level navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
    window.history.replaceState(null, '', '/f/abc234')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
  })

  it('renders accessible destination links with Main canonical and selected', () => {
    renderApp()

    const navigation = screen.getByRole('navigation', { name: 'ניווט במגרש' })
    const main = screen.getByRole('link', { name: 'ראשי' })
    const history = screen.getByRole('link', { name: 'היסטוריה' })
    const activity = screen.getByRole('link', { name: 'פעילות' })
    const settings = screen.getByRole('link', { name: 'הגדרות' })

    expect(navigation.contains(main)).toBe(true)
    expect(main.getAttribute('href')).toBe('/f/abc234')
    expect(history.getAttribute('href')).toBe('/f/abc234?tab=history')
    expect(activity.getAttribute('href')).toBe('/f/abc234?tab=activity')
    expect(settings.getAttribute('href')).toBe('/f/abc234?tab=settings')
    expect(main.getAttribute('aria-current')).toBe('page')
    expect(history.getAttribute('aria-current')).toBeNull()
  })

  it('keeps the current field name visible in the header across tabs', () => {
    renderApp('מגרש אלונים')

    const header = screen.getByRole('navigation', { name: 'ניווט במגרש' }).closest('header')
    if (header === null) throw new Error('app header not found')
    expect(within(header).getByRole('heading', { name: 'מגרש אלונים' })).toBeDefined()

    fireEvent.click(screen.getByRole('link', { name: 'הגדרות' }))
    expect(within(header).getByRole('heading', { name: 'מגרש אלונים' })).toBeDefined()
  })

  it('keeps the manager PWA install action available across manager tabs', () => {
    renderApp()
    exposeNativeInstallPrompt()

    expect(screen.getByRole('button', { name: 'התקן אפליקציה' })).toBeDefined()
    fireEvent.click(screen.getByRole('link', { name: 'הגדרות' }))
    expect(screen.getByRole('button', { name: 'התקן אפליקציה' })).toBeDefined()
  })

  it('switches secondary destinations in one entry and returns to Main on popstate without remounting the shell', () => {
    renderApp()
    const shellMain = document.querySelector('main')

    fireEvent.click(screen.getByRole('link', { name: 'הגדרות' }))
    expect(window.location.pathname + window.location.search).toBe('/f/abc234?tab=settings')
    expect(screen.getByRole('link', { name: 'הגדרות' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('ניהול ערב משחקים')).toBeDefined()

    fireEvent.click(screen.getByRole('link', { name: 'היסטוריה' }))
    expect(window.location.pathname + window.location.search).toBe('/f/abc234?tab=history')
    expect(screen.getByRole('link', { name: 'היסטוריה' }).getAttribute('aria-current')).toBe('page')

    act(() => {
      window.history.replaceState(null, '', '/f/abc234')
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })

    expect(screen.getByRole('link', { name: 'ראשי' }).getAttribute('aria-current')).toBe('page')
    expect(document.querySelector('main')).toBe(shellMain)
    expect(screen.getByRole('heading', { name: /התור/ })).toBeDefined()
  })

  it('restores a direct secondary URL and canonicalizes Main without leaving the field', () => {
    window.history.replaceState(null, '', '/f/abc234?tab=history')
    renderApp()

    expect(screen.getByRole('link', { name: 'היסטוריה' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(screen.getByRole('link', { name: 'ראשי' }))

    expect(window.location.pathname + window.location.search).toBe('/f/abc234')
    expect(screen.getByRole('link', { name: 'ראשי' }).getAttribute('aria-current')).toBe('page')
  })
})

describe('App top header — public player view link', () => {
  const mockWriteText = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
    window.history.replaceState(null, '', '/f/abc234')
    vi.mocked(showStatusToast).mockClear()
    mockWriteText.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mockWriteText },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
  })

  it('generates a stable read-only queue QR for the current field', async () => {
    renderApp('מגרש אלונים')

    const button = screen.getByRole('button', { name: 'קוד QR לתצוגת השחקנים' })
    expect(button.tagName).toBe('BUTTON')

    fireEvent.click(button)

    await waitFor(() => expect(mockWriteText).toHaveBeenCalledWith('https://line.maple-group.info/line/abc234'))
    expect(showStatusToast).toHaveBeenCalledWith('publicLine.openPlayerView.copied')
    const dialog = screen.getByRole('dialog', { name: 'קוד QR לתצוגת השחקנים' })
    expect(dialog).toBeDefined()
    expect(screen.getByTestId('public-view-qr').getAttribute('data-qr-value')).toBe(
      'https://line.maple-group.info/line/abc234',
    )

    fireEvent.click(screen.getByRole('button', { name: 'חזרה' }))
    expect(screen.queryByRole('dialog', { name: 'קוד QR לתצוגת השחקנים' })).toBeNull()
  })

  it('keeps QR generation on Main and hides it on non-Main tabs', () => {
    renderApp()
    fireEvent.click(screen.getByRole('link', { name: 'הגדרות' }))

    expect(screen.queryByRole('button', { name: 'קוד QR לתצוגת השחקנים' })).toBeNull()
  })

  it('shares the read-only queue URL instead of the manager field URL', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    renderApp('מגרש אלונים')

    fireEvent.click(screen.getByRole('button', { name: 'שיתוף קישור לתור' }))

    await waitFor(() => expect(mockWriteText).toHaveBeenCalledWith('https://line.maple-group.info/line/abc234'))
  })
})
