/**
 * Single responsibility: collect bounded aggregate visit statistics for the
 * read-only public line and send at most two durable events per page visit.
 */
import type {
  PublicLineDisplayMode,
  PublicLineTelemetryEvent,
  PublicLineViewport,
  PublicLineViewedEvent,
} from 'shared'
import { apiPost } from './api'
import type { ConnectionStatus } from '@/state/SnapshotContext'

export type PublicLineSnapshotMetrics = Omit<
  PublicLineViewedEvent,
  'type' | 'visitId' | 'viewport' | 'displayMode'
>

type TelemetrySender = (slug: string, event: PublicLineTelemetryEvent, keepalive: boolean) => void
const MAX_VISIT_SEC = 24 * 60 * 60

export interface PublicLineTelemetryTrackerOptions {
  visitId: string
  viewport: PublicLineViewport
  displayMode: PublicLineDisplayMode
  initiallyVisible: boolean
  now: () => number
  send: TelemetrySender
}

export class PublicLineTelemetryTracker {
  private readonly startedAtMs: number
  private visibleSinceMs: number | null
  private visibleMs = 0
  private slug: string | null = null
  private snapshotCount = 0
  private offlineCount = 0
  private maxQueueCount = 0
  private maxPairCount = 0
  private sawLiveMatch = false
  private lastConnection: ConnectionStatus = 'online'
  private finished = false

  constructor(private readonly options: PublicLineTelemetryTrackerOptions) {
    this.startedAtMs = options.now()
    this.visibleSinceMs = options.initiallyVisible ? this.startedAtMs : null
  }

  observeSnapshot(slug: string, metrics: PublicLineSnapshotMetrics): void {
    if (this.finished) return
    this.slug = slug
    this.snapshotCount += 1
    this.maxQueueCount = Math.max(this.maxQueueCount, metrics.queueCount)
    this.maxPairCount = Math.max(this.maxPairCount, metrics.pairCount)
    this.sawLiveMatch ||= metrics.hasLiveMatch

    if (this.snapshotCount === 1) {
      this.options.send(
        slug,
        {
          type: 'viewed',
          visitId: this.options.visitId,
          viewport: this.options.viewport,
          displayMode: this.options.displayMode,
          ...metrics,
        },
        false,
      )
    }
  }

  observeConnection(connection: ConnectionStatus): void {
    if (this.finished) return
    if (connection === 'offline' && this.lastConnection !== 'offline') this.offlineCount += 1
    this.lastConnection = connection
  }

  setVisible(visible: boolean): void {
    if (this.finished) return
    const nowMs = this.options.now()
    if (visible && this.visibleSinceMs === null) {
      this.visibleSinceMs = nowMs
      return
    }
    if (!visible && this.visibleSinceMs !== null) {
      this.visibleMs += Math.max(0, nowMs - this.visibleSinceMs)
      this.visibleSinceMs = null
    }
  }

  finish(): void {
    if (this.finished) return
    this.finished = true
    if (this.slug === null || this.snapshotCount === 0) return

    const nowMs = this.options.now()
    if (this.visibleSinceMs !== null) this.visibleMs += Math.max(0, nowMs - this.visibleSinceMs)
    const durationSec = Math.min(MAX_VISIT_SEC, Math.max(0, Math.round((nowMs - this.startedAtMs) / 1_000)))
    const visibleSec = Math.min(durationSec, Math.max(0, Math.round(this.visibleMs / 1_000)))

    this.options.send(
      this.slug,
      {
        type: 'visit_ended',
        visitId: this.options.visitId,
        viewport: this.options.viewport,
        displayMode: this.options.displayMode,
        durationSec,
        visibleSec,
        snapshotCount: this.snapshotCount,
        offlineCount: this.offlineCount,
        maxQueueCount: this.maxQueueCount,
        maxPairCount: this.maxPairCount,
        sawLiveMatch: this.sawLiveMatch,
      },
      true,
    )
  }
}

export function createPublicLineTelemetryTracker(): PublicLineTelemetryTracker {
  return new PublicLineTelemetryTracker({
    visitId: crypto.randomUUID(),
    viewport: viewportBucket(window.innerWidth),
    displayMode: isStandalone() ? 'standalone' : 'browser',
    initiallyVisible: document.visibilityState !== 'hidden',
    now: () => Date.now(),
    send(slug, event, keepalive) {
      void apiPost<{ recorded: true }>(`/fields/${slug}/public-line-events`, event, { keepalive }).catch(() => undefined)
    },
  })
}

function viewportBucket(width: number): PublicLineViewport {
  if (width < 640) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

function isStandalone(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
}
