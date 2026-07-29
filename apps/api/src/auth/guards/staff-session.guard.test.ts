/**
 * Frozen security regression: StaffSessionGuard requires a valid center JWT
 * and a valid staff-session JWT for the same center. Every inconsistency must
 * return 401 instead of granting the seeded manager identity.
 */
import type { ExecutionContext } from '@nestjs/common'
import type { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { UnauthorizedError } from '../../common/errors'
import { CENTER_COOKIE_NAME, SESSION_COOKIE_NAME } from '../token'
import { StaffSessionGuard } from './staff-session.guard'

function makeContext(cookies: Record<string, string>): { context: ExecutionContext; request: Request } {
  const request = { cookies } as unknown as Request
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
  return { context, request }
}

const centerPayload = { centerId: 'center-1' }
const sessionPayload = { staffId: 'staff-1', centerId: 'center-1', role: 'staff' as const }

describe('StaffSessionGuard', () => {
  it('throws UnauthorizedError when there is no center cookie', () => {
    const jwtService = { verify: vi.fn() } as unknown as JwtService
    const guard = new StaffSessionGuard(jwtService)
    const { context } = makeContext({})

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedError)
  })

  it('throws UnauthorizedError when there is a center cookie but no session cookie', () => {
    const jwtService = { verify: vi.fn().mockReturnValue(centerPayload) } as unknown as JwtService
    const guard = new StaffSessionGuard(jwtService)
    const { context } = makeContext({ [CENTER_COOKIE_NAME]: 'center-token' })

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedError)
  })

  it('throws UnauthorizedError when the session token fails verification', () => {
    const jwtService = {
      verify: vi
        .fn()
        .mockReturnValueOnce(centerPayload)
        .mockImplementationOnce(() => {
          throw new Error('bad token')
        }),
    } as unknown as JwtService
    const guard = new StaffSessionGuard(jwtService)
    const { context } = makeContext({
      [CENTER_COOKIE_NAME]: 'center-token',
      [SESSION_COOKIE_NAME]: 'bogus',
    })

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedError)
  })

  it('throws UnauthorizedError when session centerId does not match the center cookie', () => {
    const jwtService = {
      verify: vi
        .fn()
        .mockReturnValueOnce(centerPayload)
        .mockReturnValueOnce({ ...sessionPayload, centerId: 'other-center' }),
    } as unknown as JwtService
    const guard = new StaffSessionGuard(jwtService)
    const { context } = makeContext({
      [CENTER_COOKIE_NAME]: 'center-token',
      [SESSION_COOKIE_NAME]: 'session-token',
    })

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedError)
  })

  it('throws UnauthorizedError when the session payload is incomplete', () => {
    const jwtService = {
      verify: vi
        .fn()
        .mockReturnValueOnce(centerPayload)
        .mockReturnValueOnce({ centerId: 'center-1', role: 'staff' }),
    } as unknown as JwtService
    const guard = new StaffSessionGuard(jwtService)
    const { context } = makeContext({
      [CENTER_COOKIE_NAME]: 'center-token',
      [SESSION_COOKIE_NAME]: 'session-token',
    })

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedError)
  })

  it('throws UnauthorizedError for a signed visitor session', () => {
    const jwtService = {
      verify: vi
        .fn()
        .mockReturnValueOnce(centerPayload)
        .mockReturnValueOnce({ staffId: 'visitor-1', centerId: 'center-1', role: 'visitor' }),
    } as unknown as JwtService
    const guard = new StaffSessionGuard(jwtService)
    const { context } = makeContext({
      [CENTER_COOKIE_NAME]: 'center-token',
      [SESSION_COOKIE_NAME]: 'visitor-token',
    })

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedError)
  })

  it('attaches req.centerId and req.staff for a consistent token pair', () => {
    const jwtService = {
      verify: vi.fn().mockReturnValueOnce(centerPayload).mockReturnValueOnce(sessionPayload),
    } as unknown as JwtService
    const guard = new StaffSessionGuard(jwtService)
    const { context, request } = makeContext({
      [CENTER_COOKIE_NAME]: 'center-token',
      [SESSION_COOKIE_NAME]: 'session-token',
    })

    expect(guard.canActivate(context)).toBe(true)
    expect(request.centerId).toBe('center-1')
    expect(request.staff).toEqual(sessionPayload)
  })
})
