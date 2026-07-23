/**
 * Open-fields URL space: '/' = public home (list + create), '/f/<slug>' =
 * one editable field, and '/line' = the fixed, read-only Independence Square
 * player view reached from the public QR. Navigation is full-page
 * (location.assign) — each screen boots its own provider stack, so
 * SPA-internal routing buys nothing here.
 */
const FIELD_PATH = /^\/f\/([a-z2-9]{6})$/

/**
 * The dedicated public QR-code hostname. The API's publicLineHostGuard
 * already restricts this host server-side, but the PWA service worker
 * serves the cached app shell for any path without hitting the network —
 * so the client router must also treat the hostname as authoritative, or
 * a cached load of '/' on this host would mount the staff HomeScreen.
 */
export const PUBLIC_LINE_HOST = 'line.maple-group.info'

/** The URL teens follow (QR + copied link) — always the dedicated public
 * host, never the staff origin, so shared links can't reach the staff app. */
export const PUBLIC_LINE_URL = `https://${PUBLIC_LINE_HOST}/`

export type Route = { kind: 'home' } | { kind: 'field'; slug: string } | { kind: 'line' }

export function parseRoute(pathname: string, hostname?: string): Route {
  if (hostname === PUBLIC_LINE_HOST) return { kind: 'line' }
  if (pathname === '/line') return { kind: 'line' }
  const match = FIELD_PATH.exec(pathname)
  if (match?.[1]) return { kind: 'field', slug: match[1] }
  return { kind: 'home' }
}

export function fieldUrl(slug: string): string {
  return `/f/${slug}`
}

export function navigateToField(slug: string): void {
  window.location.assign(fieldUrl(slug))
}

export function navigateHome(): void {
  window.location.assign('/')
}
