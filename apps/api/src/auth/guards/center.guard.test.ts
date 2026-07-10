/**
 * Unit test: CenterGuard — a valid qlm_center JWT attaches its centerId.
 * Anonymous access (no cookie, or an invalid/incomplete one) falls back to
 * the single seeded center rather than rejecting (auth removed from prod —
 * see AGENTS note in center.guard.ts). Only an empty `centers` table still
 * throws UnauthorizedError, since there is nothing to fall back to.
 */
import type { ExecutionContext } from '@nestjs/common'
import type { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../../db/db.module'
import { UnauthorizedError } from '../../common/errors'
import { CENTER_COOKIE_NAME } from '../token'
import { CenterGuard } from './center.guard'

function chain<T>(rows: T[]): PromiseLike<T[]> & Record<string, unknown> {
  const builder: Record<string, unknown> = {
    from: () => builder,
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

describe('CenterGuard', () => {
  it('attaches req.centerId and returns true for a valid token', async () => {
    const jwtService = { verify: vi.fn().mockReturnValue({ centerId: 'center-1' }) } as unknown as JwtService
    const db = { select: vi.fn() } as unknown as Database
    const guard = new CenterGuard(jwtService, db)
    const { context, request } = makeContext({ [CENTER_COOKIE_NAME]: 'token' })

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request.centerId).toBe('center-1')
    expect(db.select).not.toHaveBeenCalled()
  })

  it('falls back to the seeded center when there is no center cookie', async () => {
    const jwtService = { verify: vi.fn() } as unknown as JwtService
    const select = vi.fn().mockReturnValueOnce(chain([{ id: 'fallback-center' }]))
    const db = { select } as unknown as Database
    const guard = new CenterGuard(jwtService, db)
    const { context, request } = makeContext({})

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request.centerId).toBe('fallback-center')
  })

  it('falls back to the seeded center when the token fails verification', async () => {
    const jwtService = {
      verify: vi.fn().mockImplementation(() => {
        throw new Error('bad token')
      }),
    } as unknown as JwtService
    const select = vi.fn().mockReturnValueOnce(chain([{ id: 'fallback-center' }]))
    const db = { select } as unknown as Database
    const guard = new CenterGuard(jwtService, db)
    const { context, request } = makeContext({ [CENTER_COOKIE_NAME]: 'bogus' })

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request.centerId).toBe('fallback-center')
  })

  it('falls back to the seeded center when the payload has no centerId', async () => {
    const jwtService = { verify: vi.fn().mockReturnValue({}) } as unknown as JwtService
    const select = vi.fn().mockReturnValueOnce(chain([{ id: 'fallback-center' }]))
    const db = { select } as unknown as Database
    const guard = new CenterGuard(jwtService, db)
    const { context, request } = makeContext({ [CENTER_COOKIE_NAME]: 'token' })

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request.centerId).toBe('fallback-center')
  })

  it('throws UnauthorizedError when there is no center to fall back to', async () => {
    const jwtService = { verify: vi.fn() } as unknown as JwtService
    const select = vi.fn().mockReturnValueOnce(chain([]))
    const db = { select } as unknown as Database
    const guard = new CenterGuard(jwtService, db)
    const { context } = makeContext({})

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedError)
  })
})
