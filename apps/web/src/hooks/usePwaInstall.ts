/**
 * Wraps the `beforeinstallprompt` event so the app can show its own install
 * control in the header instead of relying on the browser's native mini-infobar.
 * Not fired on iOS Safari — canInstall simply stays false there.
 */
import { useEffect, useRef, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => void
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface UsePwaInstallResult {
  canInstall: boolean
  isInstalled: boolean
  promptInstall: () => Promise<boolean>
}

export function usePwaInstall(): UsePwaInstallResult {
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(
    () =>
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      Reflect.get(navigator, 'standalone') === true,
  )
  const deferredEvent = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      deferredEvent.current = event as BeforeInstallPromptEvent
      setCanInstall(true)
    }
    function onAppInstalled() {
      deferredEvent.current = null
      setCanInstall(false)
      setIsInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  async function promptInstall() {
    const event = deferredEvent.current
    if (!event) return false
    event.prompt()
    await event.userChoice
    deferredEvent.current = null
    setCanInstall(false)
    return true
  }

  return { canInstall, isInstalled, promptInstall }
}
