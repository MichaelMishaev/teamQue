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
  promptInstall: () => Promise<void>
}

export function usePwaInstall(): UsePwaInstallResult {
  const [canInstall, setCanInstall] = useState(false)
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
    if (!event) return
    event.prompt()
    await event.userChoice
    deferredEvent.current = null
    setCanInstall(false)
  }

  return { canInstall, promptInstall }
}
