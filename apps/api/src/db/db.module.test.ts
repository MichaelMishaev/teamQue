/**
 * Unit test: DbModule's DbLifecycle provider drains the pg Pool on application
 * shutdown via onApplicationShutdown lifecycle hook. Pool.end() is called exactly
 * once when Nest invokes the shutdown sequence.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import { DbLifecycle } from './db.module'

describe('DbModule DbLifecycle', () => {
  it('calls pool.end() exactly once when onApplicationShutdown is invoked', async () => {
    const mockPool: Partial<Pool> = {
      end: vi.fn().mockResolvedValue(undefined),
    }

    const lifecycle = new DbLifecycle(mockPool as Pool)

    await lifecycle.onApplicationShutdown()

    expect(mockPool.end).toHaveBeenCalledTimes(1)
    expect(mockPool.end).toHaveBeenCalledWith()
  })
})
