/**
 * Unit test: CenterGuard (technical-prd §6) — valid qlm_center JWT required,
 * else 401 UNAUTHORIZED (fail closed, R-16); on success attaches
 * req.centerId. JwtService is mocked — no real signing/verifying.
 */
import type { ExecutionContext } from '@nestjs/common'
import type { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { UnauthorizedError } from '../../common/errors'
import { CENTER_COOKIE_NAME } from '../token'
import { CenterGuard } from './center.guard'

function makeContext(cookies: Record<string, string>): { context: ExecutionContext; request: Request } {
  const request = { cookies } as unknown as Request
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
  return { context, request }
}

describe('CenterGuard', () => {
  it('throws UnauthorizedError when there is no center cookie', () => {
    const jwtService = { verify: vi.fn() } as unknown as JwtService
    const guard = new CenterGuard(jwtService)
    const { context } = makeContext({})

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedError)
    expect(jwtService.verify).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedError when the token fails verification', () => {
    const jwtService = {
      verify: vi.fn().mockImplementation(() => {
        throw new Error('bad token')
      }),
    } as unknown as JwtService
    const guard = new CenterGuard(jwtService)
    const { context } = makeContext({ [CENTER_COOKIE_NAME]: 'bogus' })

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedError)
  })

  it('throws UnauthorizedError when the payload has no centerId', () => {
    const jwtService = { verify: vi.fn().mockReturnValue({}) } as unknown as JwtService
    const guard = new CenterGuard(jwtService)
    const { context } = makeContext({ [CENTER_COOKIE_NAME]: 'token' })

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedError)
  })

  it('attaches req.centerId and returns true for a valid token', () => {
    const jwtService = {
      verify: vi.fn().mockReturnValue({ centerId: 'center-1' }),
    } as unknown as JwtService
    const guard = new CenterGuard(jwtService)
    const { context, request } = makeContext({ [CENTER_COOKIE_NAME]: 'token' })

    expect(guard.canActivate(context)).toBe(true)
    expect(request.centerId).toBe('center-1')
  })
})
