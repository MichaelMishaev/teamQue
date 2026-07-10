/**
 * CenterGuard (technical-prd §6, amended): a valid qlm_center JWT attaches
 * req.centerId. Auth was deliberately removed from prod at the owner's
 * request — anonymous access (no cookie, or an invalid/incomplete one) now
 * falls back to the single seeded center (MVP: exactly one center row,
 * mirrors AuthService.unlockCenter) instead of 401ing. Only an empty
 * `centers` table still throws UnauthorizedError, since there is nothing to
 * fall back to.
 */
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { asc } from 'drizzle-orm'
import type { Request } from 'express'
import { UnauthorizedError } from '../../common/errors'
import { DRIZZLE, type Database } from '../../db/db.module'
import { centers } from '../../db/schema'
import { CENTER_COOKIE_NAME, verifyCenterToken } from '../token'

@Injectable()
export class CenterGuard implements CanActivate {
  // @Inject explicitly: see the note atop auth.service.ts.
  constructor(
    @Inject(JwtService) protected readonly jwtService: JwtService,
    @Inject(DRIZZLE) protected readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()
    request.centerId = await this.resolveCenterId(request)
    return true
  }

  private async resolveCenterId(request: Request): Promise<string> {
    const token = request.cookies?.[CENTER_COOKIE_NAME] as string | undefined
    if (token) {
      const centerId = this.tryReadCenterId(token)
      if (centerId) return centerId
    }
    return this.fallbackCenterId()
  }

  private tryReadCenterId(token: string): string | null {
    try {
      return verifyCenterToken(this.jwtService, token).centerId ?? null
    } catch {
      return null
    }
  }

  /** Deterministic pick (oldest-created first) so the fallback can't vary
   * between requests if the `centers` table ever has more than one row. */
  private async fallbackCenterId(): Promise<string> {
    const [center] = await this.db.select().from(centers).orderBy(asc(centers.createdAt)).limit(1)
    if (!center) throw new UnauthorizedError()
    return center.id
  }
}
