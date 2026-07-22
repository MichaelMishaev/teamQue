/**
 * Single responsibility: serve the exact public `/line` SPA entry point.
 * Deeper `/line/:entryId/*` paths remain queue-action API routes.
 */
import { join } from 'node:path'
import { Controller, Get, Res } from '@nestjs/common'
import type { Response } from 'express'

@Controller()
export class PublicLinePageController {
  @Get('line')
  serve(@Res() response: Response): void {
    const webDistPath = process.env.WEB_DIST_PATH ?? join(__dirname, '..', '..', 'web', 'dist')
    response.sendFile(join(webDistPath, 'index.html'))
  }
}
