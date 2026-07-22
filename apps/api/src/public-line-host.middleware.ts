/**
 * Restricts the anonymous public QR-code host (env PUBLIC_LINE_HOST) to the
 * read-only `/line` surface. StaffSessionGuard/CenterGuard fall back to the
 * seeded manager for any anonymous request (see staff-session.guard.ts) —
 * without this, every staff-only route would grant full manager access to
 * anyone who strips `/line` from the public URL. The primary host (used by
 * staff) is unaffected; this only narrows what the public hostname can reach.
 */
import type { NextFunction, Request, Response } from 'express'

const SENSITIVE_PREFIXES = [
  '/auth',
  '/staff',
  '/captains',
  '/sessions',
  '/matches',
  '/actions',
  '/activity',
  '/visitors',
  '/health',
]

// `/fields/:slug/close` and `/fields/:slug` share a prefix but only the
// single-segment GET (field lookup) and the public telemetry POST are public.
const FIELD_SLUG_GET = /^\/fields\/[^/]+$/
const FIELD_PUBLIC_EVENT_POST = /^\/fields\/[^/]+\/public-line-events$/

function isBlockedForPublicLineHost(method: string, path: string): boolean {
  if (path === '/line') return false
  if (path === '/fields' && method === 'GET') return false
  if (method === 'GET' && FIELD_SLUG_GET.test(path)) return false
  if (method === 'POST' && FIELD_PUBLIC_EVENT_POST.test(path)) return false
  if (path.startsWith('/socket.io/')) return false

  if (path === '/') return true
  // Deeper /line/:entryId/* paths are queue-action routes (line-entry.controller.ts),
  // not the public page — only the exact /line above is public.
  if (path.startsWith('/line/')) return true
  if (path.startsWith('/fields')) return true
  return SENSITIVE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

export function publicLineHostGuard(publicLineHost: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!publicLineHost || req.hostname !== publicLineHost) {
      next()
      return
    }
    if (isBlockedForPublicLineHost(req.method, req.path)) {
      res.status(404).end()
      return
    }
    next()
  }
}
