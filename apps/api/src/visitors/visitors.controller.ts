/**
 * Open-fields visitor identity (spec §3.2). A visitor is a `staff` row with
 * role 'visitor' — reusing the staff FKs means attribution (activity log,
 * history startedBy/endedBy names) works with zero schema or service churn.
 * The cookie is the standard qlm_session JWT, just signed with a 365d TTL.
 * POST /visitors gets a throttler bucket (10/hour/IP) — unbounded, it's an
 * unbounded-write vector on the `staff` table, same edge case as POST /fields.
 */
import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { eq } from 'drizzle-orm'
import type { Response } from 'express'
import { visitorHelloSchema, type VisitorHelloBody } from 'shared'
import { StaffSessionGuard } from '../auth/guards/staff-session.guard'
import type { StaffAuthenticatedRequest } from '../auth/request.types'
import { SESSION_COOKIE_NAME, VISITOR_COOKIE_MAX_AGE_MS, cookieOptions, signVisitorToken } from '../auth/token'
import { NotFoundError } from '../common/errors'
import { ZodValidationPipe } from '../common/zod.pipe'
import { loadEnv } from '../config/env'
import { DRIZZLE, type Database } from '../db/db.module'
import { staff } from '../db/schema'

/** Never a valid argon2 hash, so this row can never pass PIN login. */
const VISITOR_PIN_SENTINEL = 'visitor-no-pin'

@Controller('visitors')
@UseGuards(StaffSessionGuard)
export class VisitorsController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(JwtService) private readonly jwtService: JwtService,
  ) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 10 } })
  @Post()
  async hello(
    @Req() req: StaffAuthenticatedRequest,
    @Body(new ZodValidationPipe(visitorHelloSchema)) body: VisitorHelloBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ visitorId: string; nickname: string }> {
    const [row] = await this.db
      .insert(staff)
      .values({
        centerId: req.centerId,
        name: body.nickname,
        role: 'visitor',
        pinHash: VISITOR_PIN_SENTINEL,
      })
      .returning({ id: staff.id, name: staff.name })
    if (!row) throw new Error('visitor insert returned no row')

    const token = signVisitorToken(this.jwtService, {
      staffId: row.id,
      centerId: req.centerId,
      role: 'visitor',
    })
    res.cookie(SESSION_COOKIE_NAME, token, cookieOptions(VISITOR_COOKIE_MAX_AGE_MS, loadEnv().NODE_ENV))
    return { visitorId: row.id, nickname: row.name }
  }

  @Get('me')
  async me(@Req() req: StaffAuthenticatedRequest): Promise<{ visitorId: string; nickname: string }> {
    if (req.staff.role !== 'visitor') throw new NotFoundError('No visitor identity')
    const [row] = await this.db
      .select({ id: staff.id, name: staff.name })
      .from(staff)
      .where(eq(staff.id, req.staff.staffId))
      .limit(1)
    if (!row) throw new NotFoundError('No visitor identity')
    return { visitorId: row.id, nickname: row.name }
  }
}
