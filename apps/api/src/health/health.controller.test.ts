/**
 * Unit test: HealthController pings the DB and reports status. The Drizzle
 * provider is mocked — no real connection — so this stays a fast unit test;
 * real connectivity is exercised by test/migration.int.test.ts.
 */
import { ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../db/db.module'
import { HealthController } from './health.controller'

function makeController(execute: Database['execute']): HealthController {
  const fakeDb = { execute } as unknown as Database
  return new HealthController(fakeDb)
}

describe('HealthController', () => {
  it('returns ok when the DB ping resolves', async () => {
    const execute = vi.fn().mockResolvedValue(undefined)
    const controller = makeController(execute)

    await expect(controller.check()).resolves.toEqual({ status: 'ok', db: true })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('throws a 503-shaped error when the DB ping rejects', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('connection refused'))
    const controller = makeController(execute)

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(controller.check()).rejects.toMatchObject({
      response: { status: 'error', db: false },
    })
  })
})
