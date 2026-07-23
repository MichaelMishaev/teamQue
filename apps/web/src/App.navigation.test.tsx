import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

function renderApp() {
  render(
    <DemoProviders>
      <App slug="abc234" />
    </DemoProviders>,
  )
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

  it('copies the public URL, confirms via toast, and opens the QR overlay instead of navigating', async () => {
    renderApp()

    const button = screen.getByRole('button', { name: 'קוד QR לתצוגת השחקנים' })
    expect(button.tagName).toBe('BUTTON')

    fireEvent.click(button)

    await waitFor(() => expect(mockWriteText).toHaveBeenCalledWith('https://line.maple-group.info/'))
    expect(showStatusToast).toHaveBeenCalledWith('publicLine.openPlayerView.copied')
    const dialog = screen.getByRole('dialog', { name: 'קוד QR לתצוגת השחקנים' })
    expect(dialog).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'חזרה' }))
    expect(screen.queryByRole('dialog', { name: 'קוד QR לתצוגת השחקנים' })).toBeNull()
  })

  it('hides the button on non-Main tabs', () => {
    renderApp()
    fireEvent.click(screen.getByRole('link', { name: 'הגדרות' }))

    expect(screen.queryByRole('button', { name: 'קוד QR לתצוגת השחקנים' })).toBeNull()
  })
})
