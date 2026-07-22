/**
 * Unit test: publicLineHostGuard must let the primary (staff) host through
 * untouched, and on the public host allow only the read-only /line surface
 * while blocking every staff-only route and the field-mutation routes that
 * share the /fields prefix.
 */
import type { Request, Response } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { publicLineHostGuard } from './public-line-host.middleware'

const PUBLIC_HOST = 'line.maple-group.info'

function makeReqRes(hostname: string, method: string, path: string) {
  const req = { hostname, method, path } as unknown as Request
  const end = vi.fn()
  const status = vi.fn(() => ({ end }))
  const redirect = vi.fn()
  const res = { status, redirect } as unknown as Response
  const next = vi.fn()
  return { req, res, next, status, end, redirect }
}

describe('publicLineHostGuard', () => {
  it('passes every request through untouched when PUBLIC_LINE_HOST is unset', () => {
    const guard = publicLineHostGuard(undefined)
    const { req, res, next, status } = makeReqRes('anything.example.com', 'GET', '/')

    guard(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(status).not.toHaveBeenCalled()
  })

  it('passes every request through untouched on the primary (staff) host', () => {
    const guard = publicLineHostGuard(PUBLIC_HOST)
    const { req, res, next, status } = makeReqRes('gate.netanya.club', 'GET', '/')

    guard(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(status).not.toHaveBeenCalled()
  })

  it.each([
    ['GET', '/line'],
    ['GET', '/fields'],
    ['GET', '/fields/main-court'],
    ['POST', '/fields/main-court/public-line-events'],
    ['GET', '/socket.io/'],
    ['GET', '/assets/index-abc123.js'],
  ])('allows %s %s on the public host', (method, path) => {
    const guard = publicLineHostGuard(PUBLIC_HOST)
    const { req, res, next, status } = makeReqRes(PUBLIC_HOST, method, path)

    guard(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(status).not.toHaveBeenCalled()
  })

  it('redirects GET / to /line on the public host', () => {
    const guard = publicLineHostGuard(PUBLIC_HOST)
    const { req, res, next, status, redirect } = makeReqRes(PUBLIC_HOST, 'GET', '/')

    guard(req, res, next)

    expect(redirect).toHaveBeenCalledWith(302, '/line')
    expect(next).not.toHaveBeenCalled()
    expect(status).not.toHaveBeenCalled()
  })

  it.each([
    ['POST', '/'],
    ['GET', '/auth/me'],
    ['POST', '/auth/login'],
    ['GET', '/staff'],
    ['GET', '/captains'],
    ['GET', '/sessions/abc'],
    ['GET', '/matches/abc'],
    ['POST', '/actions/undo'],
    ['GET', '/activity'],
    ['GET', '/visitors'],
    ['GET', '/health'],
    ['POST', '/fields'],
    ['POST', '/fields/main-court/close'],
    ['GET', '/line/some-entry-id'],
    ['POST', '/line/some-entry-id/cancel'],
  ])('blocks %s %s on the public host with a 404', (method, path) => {
    const guard = publicLineHostGuard(PUBLIC_HOST)
    const { req, res, next, status, end } = makeReqRes(PUBLIC_HOST, method, path)

    guard(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(404)
    expect(end).toHaveBeenCalledOnce()
  })
})
