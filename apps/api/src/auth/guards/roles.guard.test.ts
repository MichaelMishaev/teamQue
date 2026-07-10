/**
 * Unit test: RolesGuard (technical-prd §6) — no req.staff or role mismatch
 * -> 403 FORBIDDEN; missing @Roles metadata -> treat as manager-only (fail
 * closed, R-16). Not wired to any route yet (no manager-only endpoint
 * exists in this phase), so it's exercised directly here.
 */
import type { ExecutionContext } from '@nestjs/common'
import type { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { ForbiddenError } from '../../common/errors'
import { RolesGuard } from './roles.guard'

function makeContext(staff: Request['staff']): ExecutionContext {
  const request = { staff } as unknown as Request
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
  } as unknown as ExecutionContext
}

function makeReflector(requiredRoles: unknown): Reflector {
  return { getAllAndOverride: vi.fn().mockReturnValue(requiredRoles) } as unknown as Reflector
}

describe('RolesGuard', () => {
  it('throws ForbiddenError when there is no req.staff', () => {
    const guard = new RolesGuard(makeReflector(['manager']))
    const context = makeContext(undefined)

    expect(() => guard.canActivate(context)).toThrow(ForbiddenError)
  })

  it('throws ForbiddenError when the staff role is not in the required roles', () => {
    const guard = new RolesGuard(makeReflector(['manager']))
    const context = makeContext({ staffId: 's1', centerId: 'c1', role: 'staff' })

    expect(() => guard.canActivate(context)).toThrow(ForbiddenError)
  })

  it('treats missing roles metadata as manager-only and rejects staff', () => {
    const guard = new RolesGuard(makeReflector(undefined))
    const context = makeContext({ staffId: 's1', centerId: 'c1', role: 'staff' })

    expect(() => guard.canActivate(context)).toThrow(ForbiddenError)
  })

  it('treats missing roles metadata as manager-only and allows manager', () => {
    const guard = new RolesGuard(makeReflector(undefined))
    const context = makeContext({ staffId: 's1', centerId: 'c1', role: 'manager' })

    expect(guard.canActivate(context)).toBe(true)
  })

  it('treats empty roles metadata as manager-only and rejects staff', () => {
    const guard = new RolesGuard(makeReflector([]))
    const context = makeContext({ staffId: 's1', centerId: 'c1', role: 'staff' })

    expect(() => guard.canActivate(context)).toThrow(ForbiddenError)
  })

  it('allows when the staff role is in the required roles', () => {
    const guard = new RolesGuard(makeReflector(['manager', 'staff']))
    const context = makeContext({ staffId: 's1', centerId: 'c1', role: 'staff' })

    expect(guard.canActivate(context)).toBe(true)
  })
})
