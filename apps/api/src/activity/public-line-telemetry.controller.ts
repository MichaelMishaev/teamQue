/**
 * Public, write-only analytics edge for the read-only QR line. It accepts a
 * strict shared schema and uses a per-IP bucket to bound database writes.
 */
import { Body, Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { z } from 'zod'
import { publicLineTelemetryEventSchema, type PublicLineTelemetryEvent } from 'shared'
import { CenterGuard } from '../auth/guards/center.guard'
import type { CenterAuthenticatedRequest } from '../auth/request.types'
import { ZodValidationPipe } from '../common/zod.pipe'
import { SLUG_PATTERN } from '../fields/slug'
import { PublicLineTelemetryWriter } from './public-line-telemetry.writer'

const slugParamSchema = z.string().regex(SLUG_PATTERN)

@Controller('fields')
@UseGuards(CenterGuard)
export class PublicLineTelemetryController {
  constructor(@Inject(PublicLineTelemetryWriter) private readonly telemetry: PublicLineTelemetryWriter) {}

  @HttpCode(202)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 300 } })
  @Post(':slug/public-line-events')
  async record(
    @Req() req: CenterAuthenticatedRequest,
    @Param('slug', new ZodValidationPipe(slugParamSchema)) slug: string,
    @Body(new ZodValidationPipe(publicLineTelemetryEventSchema)) event: PublicLineTelemetryEvent,
  ): Promise<{ recorded: true }> {
    await this.telemetry.write(req.centerId, slug, event)
    return { recorded: true }
  }
}
