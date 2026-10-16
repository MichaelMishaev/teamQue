/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register'

const UPDATE_INTERVAL_MS = 60_000

/** Checks for app-shell updates on resume and while open; preserves unfinished forms. */
export function startAppUpdates(reload = () => window.location.reload()): () => void {
  let registration: ServiceWorkerRegistration | undefined
  let checking = false
  let pendingReload = false
  let reloading = false

  const reloadIfReady = () => {
    if (!pendingReload || reloading || document.visibilityState !== 'visible') return
    // A reload restores the server snapshot, but cannot restore an unfinished edit.
    if (document.querySelector('[role="dialog"], dialog[open]')) return
    if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return
    if (Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea'))
      .some((input) => input.value !== '' && !input.disabled && !input.readOnly)) return
    reloading = true
    reload()
  }

  const checkForUpdate = () => {
    reloadIfReady()
    if (!registration || checking || !navigator.onLine || document.visibilityState !== 'visible') return
    checking = true
    // Offline/captive-portal failures are retried on the next resume or interval.
    void registration.update().catch(() => undefined).finally(() => { checking = false })
  }

  registerSW({
    immediate: true,
    onNeedReload() {
      pendingReload = true
      reloadIfReady()
    },
    onRegisteredSW(_url, registered) {
      registration = registered
      checkForUpdate()
    },
  })

  const interval = window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS)
  document.addEventListener('visibilitychange', checkForUpdate)
  document.addEventListener('focusout', reloadIfReady)
  window.addEventListener('online', checkForUpdate)
  window.addEventListener('pageshow', checkForUpdate)
  return () => {
    window.clearInterval(interval)
    document.removeEventListener('visibilitychange', checkForUpdate)
    document.removeEventListener('focusout', reloadIfReady)
    window.removeEventListener('online', checkForUpdate)
    window.removeEventListener('pageshow', checkForUpdate)
  }
}
