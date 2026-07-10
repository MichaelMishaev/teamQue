/**
 * Integration test (technical-prd §10 "API integration" / R-36): applies the
 * committed migration to an empty Postgres via Testcontainers and asserts
 * the hard DB invariants from §3 that can't be trusted to the app layer:
 * partial unique indexes and the captain-distinctness check constraint.
 */
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { captains, centers, matches, sessions, staff } from '../src/db/schema'
import { startTestPg, type TestPg } from './helpers/pg'

describe('migrations (integration)', () => {
  let pg: TestPg

  beforeAll(async () => {
    pg = await startTestPg()
  })

  afterAll(async () => {
    await pg.stop()
  })

  it('creates all 7 tables from the schema', async () => {
    const result = await pg.db.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)
    const names = result.rows.map((row) => row.table_name)

    expect(names).toEqual(
      ['activity_log', 'captains', 'centers', 'fields', 'matches', 'sessions', 'staff'].sort(),
    )
  })

  it('allows only one active session per center (partial unique index)', async () => {
    const [center] = await pg.db
      .insert(centers)
      .values({ name: 'Center A', pinHash: 'hash' })
      .returning()
    if (!center) throw new Error('center insert returned no row')

    const [staffMember] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Staffer', role: 'manager', pinHash: 'hash' })
      .returning()
    if (!staffMember) throw new Error('staff insert returned no row')

    await pg.db.insert(sessions).values({
      centerId: center.id,
      date: '2026-07-10',
      matchDurationSec: 360,
      status: 'active',
      createdBy: staffMember.id,
    })

    await expect(
      pg.db.insert(sessions).values({
        centerId: center.id,
        date: '2026-07-10',
        matchDurationSec: 360,
        status: 'active',
        createdBy: staffMember.id,
      }),
    ).rejects.toThrow()

    await expect(
      pg.db.insert(sessions).values({
        centerId: center.id,
        date: '2026-07-10',
        matchDurationSec: 360,
        status: 'closed',
        createdBy: staffMember.id,
      }),
    ).resolves.not.toThrow()
  })

  it('rejects a match whose two captains are the same row (check constraint)', async () => {
    const [center] = await pg.db
      .insert(centers)
      .values({ name: 'Center B', pinHash: 'hash' })
      .returning()
    if (!center) throw new Error('center insert returned no row')

    const [staffMember] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Staffer', role: 'staff', pinHash: 'hash' })
      .returning()
    if (!staffMember) throw new Error('staff insert returned no row')

    const [session] = await pg.db
      .insert(sessions)
      .values({
        centerId: center.id,
        date: '2026-07-10',
        matchDurationSec: 360,
        status: 'active',
        createdBy: staffMember.id,
      })
      .returning()
    if (!session) throw new Error('session insert returned no row')

    const [captain] = await pg.db
      .insert(captains)
      .values({ centerId: center.id, name: 'Captain One' })
      .returning()
    if (!captain) throw new Error('captain insert returned no row')

    await expect(
      pg.db.insert(matches).values({
        sessionId: session.id,
        centerId: center.id,
        captainAId: captain.id,
        captainBId: captain.id,
        status: 'queued',
        plannedDurationSec: 360,
      }),
    ).rejects.toThrow()
  })
})
