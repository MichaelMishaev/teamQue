import { describe, expect, it, vi } from 'vitest'
import type { PublicLineTelemetryEvent } from 'shared'
import { PublicLineTelemetryTracker } from './public-line-telemetry'

const visitId = '2e2c6e34-69f6-48a8-a8d5-4d436e9b9270'

describe('PublicLineTelemetryTracker', () => {
  it('sends one view and one keepalive visit summary without collecting player identity', () => {
    let nowMs = 0
    const sent: Array<{ slug: string; event: PublicLineTelemetryEvent; keepalive: boolean }> = []
    const send = vi.fn((slug: string, event: PublicLineTelemetryEvent, keepalive: boolean) => {
      sent.push({ slug, event, keepalive })
    })
    const tracker = new PublicLineTelemetryTracker({
      visitId,
      viewport: 'mobile',
      displayMode: 'standalone',
      initiallyVisible: true,
      now: () => nowMs,
      send,
    })

    tracker.observeSnapshot('abc234', {
      queueCount: 5,
      pairCount: 3,
      hasUnpairedTeam: true,
      hasLiveMatch: true,
      firstWaitSec: 240,
      lastWaitSec: 960,
    })
    nowMs = 5_000
    tracker.observeConnection('offline')
    tracker.observeConnection('offline')
    tracker.observeSnapshot('abc234', {
      queueCount: 7,
      pairCount: 4,
      hasUnpairedTeam: true,
      hasLiveMatch: false,
      firstWaitSec: 0,
      lastWaitSec: 1_080,
    })
    nowMs = 20_000
    tracker.setVisible(false)
    nowMs = 30_000
    tracker.finish()
    tracker.finish()

    expect(sent).toEqual([
      {
        slug: 'abc234',
        keepalive: false,
        event: {
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
        },
      },
      {
        slug: 'abc234',
        keepalive: true,
        event: {
          type: 'visit_ended',
          visitId,
          viewport: 'mobile',
          displayMode: 'standalone',
          durationSec: 30,
          visibleSec: 20,
          snapshotCount: 2,
          offlineCount: 1,
          maxQueueCount: 7,
          maxPairCount: 4,
          sawLiveMatch: true,
        },
      },
    ])
    expect(send).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(sent)).not.toContain('captain')
    expect(JSON.stringify(sent)).not.toContain('name')
  })
})
