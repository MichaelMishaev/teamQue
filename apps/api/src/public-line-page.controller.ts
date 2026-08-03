/**
 * Single responsibility: serve the public `/line` default alias and exact
 * `/line/:slug` field-queue SPA entry points. Deeper queue-action paths remain
 * API routes.
 */
import { join } from 'node:path'
import { Controller, Get, Res } from '@nestjs/common'
import type { Response } from 'express'

@Controller()
export class PublicLinePageController {
  @Get('line')
  serve(@Res() response: Response): void {
    this.sendIndex(response)
  }

  @Get('line/:slug')
  serveField(@Res() response: Response): void {
    this.sendIndex(response)
  }

  private sendIndex(response: Response): void {
    const webDistPath = process.env.WEB_DIST_PATH ?? join(__dirname, '..', '..', 'web', 'dist')
    response.sendFile(join(webDistPath, 'index.html'))
  }
}
