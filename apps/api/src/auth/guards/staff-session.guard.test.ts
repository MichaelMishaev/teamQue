/**
 * Unit test: StaffSessionGuard — a valid qlm_session JWT (consistent with the
 * resolved centerId) attaches req.staff. Anonymous access (no session
 * cookie, or an invalid/inconsistent one) falls back to the center's
 * manager — see AGENTS note in staff-session.guard.ts — instead of
 * rejecting. Only a center with no active manager still throws
 * UnauthorizedError.
 */
import type { ExecutionContext } from '@nestjs/common'
import type { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../../db/db.module'
import { UnauthorizedError } from '../../common/errors'
import { CENTER_COOKIE_NAME, SESSION_COOKIE_NAME } from '../token'
import { StaffSessionGuard } from './staff-session.guard'

function chain<T>(rows: T[]): PromiseLike<T[]> & Record<string, unknown> {
  const builder: Record<string, unknown> = {
    from: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: () => builder,
    then: (resolve: (rows: T[]) => unknown) => resolve(rows),
  }
  return builder as PromiseLike<T[]> & Record<string, unknown>
}

function makeContext(cookies: Record<string, string>): { context: ExecutionContext; request: Request } {
  const request = { cookies } as unknown as Request
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
  return { context, request }
}

const centerPayload = { centerId: 'center-1' }
const sessionPayload = { staffId: 'staff-1', centerId: 'center-1', role: 'staff' as const }
const fallbackManagerRow = { id: 'manager-1', role: 'manager' as const }

describe('StaffSessionGuard', () => {
  it('attaches req.centerId and req.staff and returns true for a consistent pair', async () => {
    const jwtService = {
      verify: vi.fn().mockReturnValueOnce(centerPayload).mockReturnValueOnce(sessionPayload),
    } as unknown as JwtService
    const db = { select: vi.fn() } as unknown as Database
    const guard = new StaffSessionGuard(jwtService, db)
    const { context, request } = makeContext({
      [CENTER_COOKIE_NAME]: 'center-token',
      [SESSION_COOKIE_NAME]: 'session-token',
    })

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request.centerId).toBe('center-1')
    expect(request.staff).toEqual(sessionPayload)
    expect(db.select).not.toHaveBeenCalled()
  })

  it('falls back to the center manager when there is no session cookie', async () => {
    const jwtService = { verify: vi.fn().mockReturnValueOnce(centerPayload) } as unknown as JwtService
    const select = vi.fn().mockReturnValueOnce(chain([fallbackManagerRow]))
    const db = { select } as unknown as Database
    const guard = new StaffSessionGuard(jwtService, db)
    const { context, request } = makeContext({ [CENTER_COOKIE_NAME]: 'center-token' })

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request.staff).toEqual({ staffId: 'manager-1', centerId: 'center-1', role: 'manager' })
  })

  it('falls back to the center manager when the session token fails verification', async () => {
    const jwtService = {
      verify: vi
        .fn()
        .mockReturnValueOnce(centerPayload)
        .mockImplementationOnce(() => {
          throw new Error('bad token')
        }),
    } as unknown as JwtService
    const select = vi.fn().mockReturnValueOnce(chain([fallbackManagerRow]))
    const db = { select } as unknown as Database
    const guard = new StaffSessionGuard(jwtService, db)
    const { context, request } = makeContext({
      [CENTER_COOKIE_NAME]: 'center-token',
      [SESSION_COOKIE_NAME]: 'bogus',
    })

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request.staff).toEqual({ staffId: 'manager-1', centerId: 'center-1', role: 'manager' })
  })

  it('falls back to the center manager when the session centerId does not match the resolved centerId', async () => {
    const jwtService = {
      verify: vi
        .fn()
        .mockReturnValueOnce(centerPayload)
        .mockReturnValueOnce({ ...sessionPayload, centerId: 'other-center' }),
    } as unknown as JwtService
    const select = vi.fn().mockReturnValueOnce(chain([fallbackManagerRow]))
    const db = { select } as unknown as Database
    const guard = new StaffSessionGuard(jwtService, db)
    const { context, request } = makeContext({
      [CENTER_COOKIE_NAME]: 'center-token',
      [SESSION_COOKIE_NAME]: 'session-token',
    })

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request.staff).toEqual({ staffId: 'manager-1', centerId: 'center-1', role: 'manager' })
  })

  it('falls back to the center manager when the session payload is missing staffId', async () => {
    const jwtService = {
      verify: vi.fn().mockReturnValueOnce(centerPayload).mockReturnValueOnce({ centerId: 'center-1', role: 'staff' }),
    } as unknown as JwtService
    const select = vi.fn().mockReturnValueOnce(chain([fallbackManagerRow]))
    const db = { select } as unknown as Database
    const guard = new StaffSessionGuard(jwtService, db)
    const { context, request } = makeContext({
      [CENTER_COOKIE_NAME]: 'center-token',
      [SESSION_COOKIE_NAME]: 'session-token',
    })

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request.staff).toEqual({ staffId: 'manager-1', centerId: 'center-1', role: 'manager' })
  })

  it('throws UnauthorizedError when the resolved center has no active manager to fall back to', async () => {
    const jwtService = { verify: vi.fn().mockReturnValueOnce(centerPayload) } as unknown as JwtService
    const select = vi.fn().mockReturnValueOnce(chain([]))
    const db = { select } as unknown as Database
    const guard = new StaffSessionGuard(jwtService, db)
    const { context } = makeContext({ [CENTER_COOKIE_NAME]: 'center-token' })

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedError)
  })
})
