import { t } from '@/i18n'

export interface PwaIdentity {
  manifestHref: string
  faviconHref: string
  appleTouchIconHref: string
  title: string
}

const MANAGER_IDENTITY: PwaIdentity = {
  manifestHref: '/manifest-manager.webmanifest',
  faviconHref: '/icons/manager-icon-32.png',
  appleTouchIconHref: '/icons/manager-icon-192.png',
  title: t('app.managerName'),
}

const LINE_IDENTITY: PwaIdentity = {
  manifestHref: '/manifest-line.webmanifest',
  faviconHref: '/favicon-32.png',
  appleTouchIconHref: '/apple-touch-icon.png',
  title: t('app.lineName'),
}

/** Selects the install identity before React mounts so each origin is a distinct PWA. */
export function getPwaIdentity(hostname: string, pathname: string): PwaIdentity {
  const isLine = hostname === 'line.maple-group.info' || pathname === '/line' || pathname.startsWith('/line/')
  return isLine ? LINE_IDENTITY : MANAGER_IDENTITY
}

/** Applies host-specific manifest and launcher metadata to the shared HTML shell. */
export function applyPwaIdentity(hostname: string, pathname: string): void {
  const identity = getPwaIdentity(hostname, pathname)
  const existingManifest = document.querySelector<HTMLLinkElement>('#app-manifest')
  const manifest = existingManifest ?? document.createElement('link')
  manifest.id = 'app-manifest'
  manifest.rel = 'manifest'
  manifest.href = identity.manifestHref
  if (!existingManifest) document.head.append(manifest)

  const favicon = document.querySelector<HTMLLinkElement>('link[data-pwa-favicon]')
  if (favicon) favicon.href = identity.faviconHref

  const appleTouchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
  if (appleTouchIcon) appleTouchIcon.href = identity.appleTouchIconHref

  const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
  if (appleTitle) appleTitle.content = identity.title

  document.title = identity.title
}
