import { describe, expect, it } from 'vitest'
import { publicLineTelemetryEventSchema } from './public-line-telemetry.js'

const visitId = '2e2c6e34-69f6-48a8-a8d5-4d436e9b9270'

describe('publicLineTelemetryEventSchema', () => {
  it('accepts the bounded aggregate data needed for a public-line view', () => {
    expect(
      publicLineTelemetryEventSchema.parse({
        type: 'viewed',
        visitId,
        viewport: 'mobile',
        displayMode: 'standalone',
        queueCount: 5,
        pairCount: 3,
        hasUnpairedTeam: true,
        hasLiveMatch: true,
        firstWaitSec: 240,
        lastWaitSec: 960,
      }),
    ).toMatchObject({ type: 'viewed', visitId, queueCount: 5 })
  })

  it('rejects player names and all other unapproved fields', () => {
    const result = publicLineTelemetryEventSchema.safeParse({
      type: 'viewed',
      visitId,
      viewport: 'mobile',
      displayMode: 'browser',
      queueCount: 2,
      pairCount: 1,
      hasUnpairedTeam: false,
      hasLiveMatch: false,
      firstWaitSec: 0,
      lastWaitSec: 0,
      captainName: 'must not be logged',
    })

    expect(result.success).toBe(false)
  })

  it('rejects impossible visit durations', () => {
    const result = publicLineTelemetryEventSchema.safeParse({
      type: 'visit_ended',
      visitId,
      viewport: 'desktop',
      displayMode: 'browser',
      durationSec: 20,
      visibleSec: 21,
      snapshotCount: 2,
      offlineCount: 0,
      maxQueueCount: 4,
      maxPairCount: 2,
      sawLiveMatch: true,
    })

    expect(result.success).toBe(false)
  })
})
