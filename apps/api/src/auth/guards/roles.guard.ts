/**
 * RolesGuard (technical-prd §6): no req.staff or role mismatch -> 403
 * FORBIDDEN. Missing @Roles metadata is treated as manager-only (fail
 * closed, R-16) rather than "no restriction" — an endpoint added later
 * without a @Roles() decorator defaults to the most privileged role only.
 */
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import type { StaffRole } from 'shared'
import { ForbiddenError } from '../../common/errors'
import { ROLES_KEY } from '../decorators/roles.decorator'

const MANAGER_ONLY: readonly StaffRole[] = ['manager']

@Injectable()
export class RolesGuard implements CanActivate {
  // @Inject explicitly: see the note atop auth.service.ts.
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const staff = request.staff
    if (!staff) throw new ForbiddenError()

    const requiredRoles = this.reflector.getAllAndOverride<StaffRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    const allowedRoles = requiredRoles && requiredRoles.length > 0 ? requiredRoles : MANAGER_ONLY

    if (!allowedRoles.includes(staff.role)) throw new ForbiddenError()

    return true
  }
}
