import { act, render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InstallAppButton } from './InstallAppButton'

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
  it('renders nothing when no install prompt is available', () => {
    render(<InstallAppButton />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders an accessible button once beforeinstallprompt fires, and triggers the native prompt on click', async () => {
    render(<InstallAppButton />)
    const event = fireBeforeInstallPrompt()

    const button = screen.getByRole('button', { name: 'התקן אפליקציה' })
    await act(async () => {
      fireEvent.click(button)
      await event.userChoice
    })

    expect(event.prompt).toHaveBeenCalled()
  })
})
