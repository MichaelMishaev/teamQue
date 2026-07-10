/**
 * StaffSessionGuard (technical-prd §6, amended): implies CenterGuard's
 * center resolution PLUS a valid qlm_session JWT whose centerId matches.
 * Auth was deliberately removed from prod at the owner's request —
 * anonymous access (no session cookie, or an invalid/inconsistent one) now
 * falls back to the resolved center's active manager instead of 401ing.
 * Only a center with no active manager still throws UnauthorizedError.
 */
import { Inject, Injectable, type ExecutionContext } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { and, eq } from 'drizzle-orm'
import type { Request } from 'express'
import type { StaffRole } from 'shared'
import { UnauthorizedError } from '../../common/errors'
import { DRIZZLE, type Database } from '../../db/db.module'
import { staff } from '../../db/schema'
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionTokenPayload } from '../token'
import { CenterGuard } from './center.guard'
import type { StaffAuthContext } from '../request.types'

@Injectable()
export class StaffSessionGuard extends CenterGuard {
  // @Inject explicitly: see the note atop auth.service.ts.
  constructor(@Inject(JwtService) jwtService: JwtService, @Inject(DRIZZLE) db: Database) {
    super(jwtService, db)
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context)

    const request = context.switchToHttp().getRequest<Request>()
    request.staff = await this.resolveStaff(request)
    return true
  }

  private async resolveStaff(request: Request): Promise<StaffAuthContext> {
    const token = request.cookies?.[SESSION_COOKIE_NAME] as string | undefined
    if (token) {
      const staffContext = this.tryReadStaff(token, request.centerId as string)
      if (staffContext) return staffContext
    }
    return this.fallbackStaff(request.centerId as string)
  }

  private tryReadStaff(token: string, centerId: string): StaffAuthContext | null {
    let payload: SessionTokenPayload
    try {
      payload = verifySessionToken(this.jwtService, token)
    } catch {
      return null
    }
    if (!payload.staffId || !payload.role || payload.centerId !== centerId) return null
    return { staffId: payload.staffId, centerId: payload.centerId, role: payload.role }
  }

  private async fallbackStaff(centerId: string): Promise<StaffAuthContext> {
    const [member] = await this.db
      .select({ id: staff.id, role: staff.role })
      .from(staff)
      .where(and(eq(staff.centerId, centerId), eq(staff.role, 'manager'), eq(staff.active, true)))
      .limit(1)
    if (!member) throw new UnauthorizedError()
    return { staffId: member.id, centerId, role: member.role as StaffRole }
  }
}
