/**
 * Staff picker list (technical-prd §7: `GET /staff`) — active staff of the
 * caller's center, names only, no PIN data. Follows HealthController's
 * pattern of querying Drizzle directly (no service layer for a single
 * read-only query).
 */
import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import { CenterGuard } from '../auth/guards/center.guard'
import type { CenterAuthenticatedRequest } from '../auth/request.types'
import { DRIZZLE, type Database } from '../db/db.module'
import { staff } from '../db/schema'

@Controller('staff')
export class StaffController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @UseGuards(CenterGuard)
  @Get()
  async list(@Req() req: CenterAuthenticatedRequest): Promise<Array<{ id: string; name: string; role: string }>> {
    return this.db
      .select({ id: staff.id, name: staff.name, role: staff.role })
      .from(staff)
      .where(and(eq(staff.centerId, req.centerId), eq(staff.active, true)))
      .orderBy(asc(staff.name))
  }
}
