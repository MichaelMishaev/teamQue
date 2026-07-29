/**
 * Frozen security regression: anonymous center resolution is permitted only
 * on the exact configured public-line hostname. Every other hostname must
 * pass the normal staff-session guard.
 */
import type { ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../../db/db.module'
import { UnauthorizedError } from '../../common/errors'
import type { StaffSessionGuard } from './staff-session.guard'
import { PublicLineReadGuard } from './public-line-read.guard'

function chain<T>(rows: T[]): PromiseLike<T[]> & Record<string, unknown> {
  const builder: Record<string, unknown> = {
    from: () => builder,
    orderBy: () => builder,
    limit: () => builder,
    then: (resolve: (rows: T[]) => unknown) => resolve(rows),
  }
  return builder as PromiseLike<T[]> & Record<string, unknown>
}

function makeContext(hostname: string): { context: ExecutionContext; request: Request } {
  const request = { hostname, cookies: {} } as unknown as Request
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
  return { context, request }
}

describe('PublicLineReadGuard', () => {
  it('allows the exact public host and attaches the seeded center', async () => {
    const staffGuard = { canActivate: vi.fn() } as unknown as StaffSessionGuard
    const db = { select: vi.fn().mockReturnValue(chain([{ id: 'center-1' }])) } as unknown as Database
    const guard = new PublicLineReadGuard(staffGuard, db, 'line.maple-group.info')
    const { context, request } = makeContext('line.maple-group.info')

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request.centerId).toBe('center-1')
    expect(staffGuard.canActivate).not.toHaveBeenCalled()
  })

  it('delegates manager and lookalike hosts to StaffSessionGuard', async () => {
    const staffGuard = { canActivate: vi.fn().mockResolvedValue(true) } as unknown as StaffSessionGuard
    const db = { select: vi.fn() } as unknown as Database
    const guard = new PublicLineReadGuard(staffGuard, db, 'line.maple-group.info')

    for (const hostname of ['gate.netanya.club', 'line.maple-group.info.evil.example']) {
      const { context } = makeContext(hostname)
      await expect(guard.canActivate(context)).resolves.toBe(true)
    }
    expect(staffGuard.canActivate).toHaveBeenCalledTimes(2)
    expect(db.select).not.toHaveBeenCalled()
  })

  it('fails closed when the public host has no configured center', async () => {
    const staffGuard = { canActivate: vi.fn() } as unknown as StaffSessionGuard
    const db = { select: vi.fn().mockReturnValue(chain([])) } as unknown as Database
    const guard = new PublicLineReadGuard(staffGuard, db, 'line.maple-group.info')
    const { context } = makeContext('line.maple-group.info')

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedError)
  })
})
