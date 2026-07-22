/**
 * Open-fields URL space: '/' = public home (list + create), '/f/<slug>' =
 * one editable field, and '/line' = the fixed, read-only Independence Square
 * player view reached from the public QR. Navigation is full-page
 * (location.assign) — each screen boots its own provider stack, so
 * SPA-internal routing buys nothing here.
 */
const FIELD_PATH = /^\/f\/([a-z2-9]{6})$/

export type Route = { kind: 'home' } | { kind: 'field'; slug: string } | { kind: 'line' }

export function parseRoute(pathname: string): Route {
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
