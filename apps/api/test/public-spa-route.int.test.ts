/**
 * Regression: the exact public `/line` URL is an SPA route, while deeper
 * `/line/:entryId/*` URLs remain reserved for queue-entry API actions.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startTestPg, type TestPg } from './helpers/pg'

const SESSION_SECRET = 's'.repeat(32)

describe('public SPA route (integration)', () => {
  let pg: TestPg
  let app: INestApplication
  let spaRoot: string

  beforeAll(async () => {
    spaRoot = mkdtempSync(join(tmpdir(), 'teamque-public-spa-'))
    writeFileSync(join(spaRoot, 'index.html'), '<!doctype html><html><body>public-line-spa</body></html>')
    process.env.WEB_DIST_PATH = spaRoot

    pg = await startTestPg()
    process.env.DATABASE_URL = pg.container.getConnectionUri()
    process.env.SESSION_SECRET = SESSION_SECRET
    process.env.WEB_ORIGIN = 'http://localhost:5173'
    process.env.NODE_ENV = 'test'

    const { AppModule } = await import('../src/app.module')
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    await app.init()
  }, 60_000)

  afterAll(async () => {
    await app.close()
    await pg.stop()
    rmSync(spaRoot, { recursive: true, force: true })
  })

  it('serves the web index at the exact /line path', async () => {
    const response = await request(app.getHttpServer()).get('/line').expect(200)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.text).toContain('public-line-spa')
  })

  it('does not serve the web index for deeper queue-entry API paths', async () => {
    const response = await request(app.getHttpServer()).get('/line/not-an-entry/move-top').expect(404)
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.text).not.toContain('public-line-spa')
  })
})
