/**
 * Keeps the manager and public-line origins separate. The public hostname is
 * fail-closed: only the read-only line page, its static assets, read APIs,
 * telemetry edge, and Socket.IO transport are allowed. The manager hostname
 * redirects `/line` and `/line/:slug` to the canonical public origin so a
 * stale line PWA cannot accidentally display manager content.
 */
import type { NextFunction, Request, Response } from 'express'

const FIELD_SLUG_GET = /^\/fields\/[^/]+$/
const FIELD_PUBLIC_EVENT_POST = /^\/fields\/[^/]+\/public-line-events$/
const PUBLIC_LINE_PAGE = /^\/line\/[a-z2-9]{6}$/
const WORKBOX_ASSET = /^\/workbox-[a-zA-Z0-9._-]+\.js$/
const STATIC_PREFIXES = ['/assets/', '/icons/', '/media/']
const STATIC_FILES = new Set([
  '/index.html',
  '/manifest.webmanifest',
  '/manifest-line.webmanifest',
  '/registerSW.js',
  '/sw.js',
  '/favicon.ico',
  '/favicon-16.png',
  '/favicon-32.png',
  '/apple-touch-icon.png',
])

function isAllowedPublicRequest(method: string, path: string): boolean {
  if ((method === 'GET' || method === 'HEAD') && path === '/line') return true
  if ((method === 'GET' || method === 'HEAD') && PUBLIC_LINE_PAGE.test(path)) return true
  if ((method === 'GET' || method === 'HEAD') && STATIC_FILES.has(path)) return true
  if ((method === 'GET' || method === 'HEAD') && WORKBOX_ASSET.test(path)) return true
  if ((method === 'GET' || method === 'HEAD') && STATIC_PREFIXES.some((prefix) => path.startsWith(prefix))) return true
  if (method === 'GET' && path === '/fields') return true
  if (method === 'GET' && FIELD_SLUG_GET.test(path)) return true
  if (method === 'POST' && FIELD_PUBLIC_EVENT_POST.test(path)) return true
  if ((method === 'GET' || method === 'POST') && path.startsWith('/socket.io/')) return true
  return false
}

export function publicLineHostGuard(publicLineHost: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!publicLineHost) {
      next()
      return
    }

    if (req.hostname !== publicLineHost) {
      if (
        (req.method === 'GET' || req.method === 'HEAD') &&
        (req.path === '/line' || PUBLIC_LINE_PAGE.test(req.path))
      ) {
        res.redirect(302, `https://${publicLineHost}${req.path}`)
        return
      }
      next()
      return
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && req.path === '/') {
      res.redirect(302, '/line')
      return
    }
    if (!isAllowedPublicRequest(req.method, req.path)) {
      res.status(404).end()
      return
    }
    next()
  }
}
