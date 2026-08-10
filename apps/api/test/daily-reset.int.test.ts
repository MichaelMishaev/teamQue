/** Critical daily-reset regression: destructive line/match transition is
 * serialized, history-preserving, and suppressible for one reset only. */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppModule } from '../src/app.module'
import { activityLog, centers, matches, queueEntries, sessions, staff } from '../src/db/schema'
import { DailyResetService } from '../src/fields/daily-reset.service'
import { FieldsService } from '../src/fields/fields.service'
import { MatchesService } from '../src/matches/matches.service'
import { LineService } from '../src/queue/line.service'
import { SnapshotService } from '../src/sessions/snapshot.service'
import { startTestPg, type TestPg } from './helpers/pg'

const RESET_AT = new Date('2026-08-10T02:00:00.000Z') // 05:00 Jerusalem (DST)
const WARNING_AT = new Date('2026-08-10T01:45:00.000Z')

describe('daily 05:00 reset (integration)', () => {
  let pg: TestPg
  let app: INestApplication
  let centerId: string
  let staffId: string
  let fieldsService: FieldsService
  let lineService: LineService
  let matchesService: MatchesService
  let snapshotService: SnapshotService
  let dailyResetService: DailyResetService

  beforeAll(async () => {
    pg = await startTestPg()
    process.env.DATABASE_URL = pg.container.getConnectionUri()
    process.env.SESSION_SECRET = 'r'.repeat(32)
    process.env.WEB_ORIGIN = 'http://localhost:5173'
    process.env.NODE_ENV = 'test'

    const [center] = await pg.db.insert(centers).values({ name: 'Reset Center', pinHash: await hash('9876') }).returning()
    if (!center) throw new Error('center insert returned no row')
    centerId = center.id
    const [member] = await pg.db
      .insert(staff)
      .values({ centerId, name: 'Manager', role: 'manager', pinHash: await hash('6666') })
      .returning()
    if (!member) throw new Error('staff insert returned no row')
    staffId = member.id

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    fieldsService = app.get(FieldsService)
    lineService = app.get(LineService)
    matchesService = app.get(MatchesService)
    snapshotService = app.get(SnapshotService)
    dailyResetService = app.get(DailyResetService)
  }, 60_000)

  afterEach(() => vi.useRealTimers())

  afterAll(async () => {
    await app.close()
    await pg.stop()
  })

  async function liveField(name: string): Promise<{ sessionId: string; slug: string; captainAId: string }> {
    vi.setSystemTime(new Date('2026-08-09T20:00:00.000Z'))
    const created = await fieldsService.create(centerId, staffId, { name, matchDurationSec: 300 })
    const sessionId = created.snapshot.session.id
    await pg.db.update(sessions).set({ createdAt: new Date('2026-08-09T20:00:00.000Z') }).where(eq(sessions.id, sessionId))
    const first = await lineService.addToLine(centerId, staffId, sessionId, { team: { newName: `${name} א` } })
    await lineService.addToLine(centerId, staffId, sessionId, { team: { newName: `${name} ב` } })
    await matchesService.start(centerId, staffId, sessionId, {})
    await lineService.addToLine(centerId, staffId, sessionId, { team: { newName: `${name} ממתין` } })
    return { sessionId, slug: created.slug, captainAId: first.team.id }
  }

  it('exactly one of eight concurrent schedulers resets a field, while History remains and today stats restart', async () => {
    const field = await liveField('מגרש איפוס')
    vi.setSystemTime(RESET_AT)

    const counts = await Promise.all(Array.from({ length: 8 }, () => dailyResetService.resetDueFields(RESET_AT)))

    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1)
    const [session] = await pg.db.select().from(sessions).where(eq(sessions.id, field.sessionId))
    expect(session?.status).toBe('active')
    expect(await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, field.sessionId))).toHaveLength(0)
    const [finished] = await pg.db.select().from(matches).where(eq(matches.sessionId, field.sessionId))
    expect(finished).toMatchObject({ status: 'finished', endReason: 'auto', endedBy: null })

    const resetRows = await pg.db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.sessionId, field.sessionId), eq(activityLog.action, 'field.daily_reset')))
    expect(resetRows).toHaveLength(1)

    await lineService.addToLine(centerId, staffId, field.sessionId, { team: field.captainAId })
    const snapshot = await snapshotService.buildSnapshotBySessionId(field.sessionId)
    expect(snapshot.queue[0]?.team).toMatchObject({ gamesToday: 0, lastPlayedAt: null })
    expect(snapshot.session.dailyReset).toEqual({ at: '2026-08-11T02:00:00.000Z', stopped: false })
    await pg.db.update(sessions).set({ status: 'closed' }).where(eq(sessions.id, field.sessionId))
  })

  it('a Stop committed in the warning window wins over reset and rearms the next day', async () => {
    const field = await liveField('מגרש עצירה')
    vi.setSystemTime(new Date('2026-08-10T01:29:59.000Z'))
    await expect(fieldsService.stopDailyReset(field.slug, centerId, staffId, new Date())).rejects.toThrow(
      'Daily reset can only be stopped during its warning window',
    )
    vi.setSystemTime(WARNING_AT)

    await fieldsService.stopDailyReset(field.slug, centerId, staffId, WARNING_AT)
    const stoppedSnapshot = await snapshotService.buildSnapshotBySessionId(field.sessionId)
    expect(stoppedSnapshot.session.dailyReset).toEqual({ at: RESET_AT.toISOString(), stopped: true })

    vi.setSystemTime(RESET_AT)
    expect(await dailyResetService.resetDueFields(RESET_AT)).toBe(0)
    expect(await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, field.sessionId))).toHaveLength(1)
    expect((await pg.db.select().from(matches).where(eq(matches.sessionId, field.sessionId)))[0]?.status).toBe('live')

    const nextReset = new Date('2026-08-11T02:00:00.000Z')
    vi.setSystemTime(nextReset)
    expect(await dailyResetService.resetDueFields(nextReset)).toBe(1)
    expect(await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, field.sessionId))).toHaveLength(0)
  })
})
