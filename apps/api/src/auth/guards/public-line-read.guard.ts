/**
 * Allows anonymous center resolution only on the exact configured public-line
 * hostname. All other hosts delegate to the strict staff-session guard.
 */
import { Inject, Injectable, Optional, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { asc } from 'drizzle-orm'
import type { Request } from 'express'
import { UnauthorizedError } from '../../common/errors'
import { DRIZZLE, type Database } from '../../db/db.module'
import { centers } from '../../db/schema'
import { StaffSessionGuard } from './staff-session.guard'

export const PUBLIC_LINE_HOST_TOKEN = Symbol('PUBLIC_LINE_HOST')

@Injectable()
export class PublicLineReadGuard implements CanActivate {
  constructor(
    @Inject(StaffSessionGuard) private readonly staffSessionGuard: StaffSessionGuard,
    @Inject(DRIZZLE) private readonly db: Database,
    @Optional() @Inject(PUBLIC_LINE_HOST_TOKEN) private readonly publicLineHost?: string,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()
    const publicLineHost = this.publicLineHost ?? process.env.PUBLIC_LINE_HOST
    if (!publicLineHost || request.hostname !== publicLineHost) {
      return this.staffSessionGuard.canActivate(context)
    }

    const [center] = await this.db.select({ id: centers.id }).from(centers).orderBy(asc(centers.createdAt)).limit(1)
    if (!center) throw new UnauthorizedError()
    request.centerId = center.id
    return true
  }
}
