import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegisterSWOptions } from 'virtual:pwa-register'
import { startAppUpdates } from './appUpdates'

const registration = vi.hoisted(() => ({ options: undefined as RegisterSWOptions | undefined }))
vi.mock('virtual:pwa-register', () => ({
  registerSW: vi.fn((options: RegisterSWOptions) => { registration.options = options }),
}))

// MGR-PWA-004: an already-open shell must discover and apply a new release.
describe('automatic app updates (MGR-PWA-004)', () => {
  let stop: () => void
  const reload = vi.fn()
  const update = vi.fn<() => Promise<ServiceWorkerRegistration>>()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    update.mockResolvedValue({} as ServiceWorkerRegistration)
    stop = startAppUpdates(reload)
    registration.options?.onRegisteredSW?.('/sw.js', { update } as unknown as ServiceWorkerRegistration)
  })

  afterEach(() => {
    stop()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('checks at startup, periodically, on resume, and on reconnection', async () => {
    expect(registration.options?.immediate).toBe(true)
    expect(update).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(update).toHaveBeenCalledTimes(2)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    window.dispatchEvent(new Event('pageshow'))
    expect(update).toHaveBeenCalledTimes(5)
  })

  it('reloads once when the new worker activates, never on initial registration alone', () => {
    expect(reload).not.toHaveBeenCalled()
    registration.options?.onNeedReload?.()
    registration.options?.onNeedReload?.()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('waits until an unfinished form is closed before reloading', async () => {
    document.body.innerHTML = '<div role="dialog"><input value="unfinished captain"></div>'
    registration.options?.onNeedReload?.()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(reload).not.toHaveBeenCalled()
    document.querySelector('[role="dialog"]')?.removeAttribute('role')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(reload).not.toHaveBeenCalled()
    document.body.innerHTML = ''
    await vi.advanceTimersByTimeAsync(60_000)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('waits for a visible page and retries after an offline update failure', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    registration.options?.onNeedReload?.()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(update).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    update.mockRejectedValueOnce(new TypeError('offline'))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(update).toHaveBeenCalledTimes(3)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not poll offline or overlap checks and removes listeners on cleanup', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(update).toHaveBeenCalledTimes(1)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    update.mockReturnValue(new Promise(() => undefined))
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(update).toHaveBeenCalledTimes(2)
    stop()
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(update).toHaveBeenCalledTimes(2)
  })
})
