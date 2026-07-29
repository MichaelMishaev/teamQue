import { act, render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { showStatusToast } from './UndoToast'
import { InstallAppButton } from './InstallAppButton'

vi.mock('./UndoToast', () => ({ showStatusToast: vi.fn() }))

function installDisplayMode(matches: boolean): void {
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

function fireBeforeInstallPrompt() {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => void
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  event.prompt = vi.fn()
  event.userChoice = Promise.resolve({ outcome: 'accepted' })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

describe('InstallAppButton', () => {
  beforeEach(() => {
    vi.mocked(showStatusToast).mockClear()
    installDisplayMode(false)
  })

  it('always renders in a normal browser and explains the browser-menu fallback when no native prompt is available', async () => {
    render(<InstallAppButton />)

    fireEvent.click(screen.getByRole('button', { name: 'התקן אפליקציה' }))

    await waitFor(() => expect(showStatusToast).toHaveBeenCalledWith('app.install.fallback'))
  })

  it('renders an accessible button once beforeinstallprompt fires, and triggers the native prompt on click', async () => {
    render(<InstallAppButton />)
    const event = fireBeforeInstallPrompt()

    const button = screen.getByRole('button', { name: 'התקן אפליקציה' })
    expect(screen.getByText('התקן')).toBeDefined()
    expect(button.querySelector('svg')).not.toBeNull()
    expect(button.textContent).not.toContain('⬇')
    await act(async () => {
      fireEvent.click(button)
      await event.userChoice
    })

    expect(event.prompt).toHaveBeenCalled()
  })

  it('can remain visible in a browser header even when an installed copy also exists', () => {
    installDisplayMode(true)

    render(<InstallAppButton showWhenInstalled />)

    expect(screen.getByRole('button', { name: 'התקן אפליקציה' })).toBeDefined()
  })
})
