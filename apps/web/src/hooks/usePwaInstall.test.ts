import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePwaInstall } from './usePwaInstall'

function makeBeforeInstallPromptEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => void
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  event.prompt = vi.fn()
  event.userChoice = Promise.resolve({ outcome })
  return event
}

describe('usePwaInstall', () => {
  it('canInstall is false until the browser fires beforeinstallprompt', () => {
    const { result } = renderHook(() => usePwaInstall())
    expect(result.current.canInstall).toBe(false)
  })

  it('flips canInstall to true and suppresses the native mini-infobar', () => {
    const { result } = renderHook(() => usePwaInstall())
    const event = makeBeforeInstallPromptEvent('accepted')
    const preventDefault = vi.spyOn(event, 'preventDefault')

    act(() => {
      window.dispatchEvent(event)
    })

    expect(preventDefault).toHaveBeenCalled()
    expect(result.current.canInstall).toBe(true)
  })

  it('promptInstall replays the captured event and clears canInstall once the user decides', async () => {
    const { result } = renderHook(() => usePwaInstall())
    const event = makeBeforeInstallPromptEvent('accepted')

    act(() => {
      window.dispatchEvent(event)
    })
    expect(result.current.canInstall).toBe(true)

    await act(async () => {
      await result.current.promptInstall()
    })

    expect(event.prompt).toHaveBeenCalled()
    expect(result.current.canInstall).toBe(false)
  })

  it('promptInstall is a no-op when no install event was ever captured', async () => {
    const { result } = renderHook(() => usePwaInstall())
    await act(async () => {
      await result.current.promptInstall()
    })
    expect(result.current.canInstall).toBe(false)
  })

  it('clears canInstall when the app fires appinstalled', () => {
    const { result } = renderHook(() => usePwaInstall())
    const event = makeBeforeInstallPromptEvent('accepted')

    act(() => {
      window.dispatchEvent(event)
    })
    expect(result.current.canInstall).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(result.current.canInstall).toBe(false)
  })
})
