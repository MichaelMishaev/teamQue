/**
 * Idempotent dev seed (technical-prd §6, Phase 2 plan "seed script").
 * Upserts by name: one center + 3 staff. Run: `pnpm --filter api seed`.
 *
 * PIN env vars are DEV-ONLY placeholders for local sandbox setup — NEVER
 * commit real PINs. Only שרה's PIN is overridable (SEED_STAFF_PIN); דוד
 * and מיכאל get fixed dev PINs, matching the phase-2b spec's data set.
 */
import 'reflect-metadata'
import { hash } from '@node-rs/argon2'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import pino from 'pino'
import type { StaffRole } from 'shared'
import { loadEnv } from '../src/config/env'
import type { Database as Db } from '../src/db/db.module'
import { centers, staff } from '../src/db/schema'
import * as schema from '../src/db/schema'

const logger = pino()

async function upsertCenter(db: Db, name: string, pin: string): Promise<string> {
  const pinHash = await hash(pin)
  const [existing] = await db.select().from(centers).where(eq(centers.name, name)).limit(1)
  if (existing) {
    await db.update(centers).set({ pinHash }).where(eq(centers.id, existing.id))
    return existing.id
  }

  const [created] = await db.insert(centers).values({ name, pinHash }).returning()
  if (!created) throw new Error('center insert returned no row')
  return created.id
}

async function upsertStaff(db: Db, centerId: string, name: string, role: StaffRole, pin: string): Promise<string> {
  const pinHash = await hash(pin)
  const [existing] = await db
    .select()
    .from(staff)
    .where(and(eq(staff.centerId, centerId), eq(staff.name, name)))
    .limit(1)
  if (existing) {
    await db.update(staff).set({ pinHash, role, active: true }).where(eq(staff.id, existing.id))
    return existing.id
  }

  const [created] = await db.insert(staff).values({ centerId, name, role, pinHash }).returning()
  if (!created) throw new Error('staff insert returned no row')
  return created.id
}

async function main(): Promise<void> {
  const env = loadEnv()
  const pool = new Pool({ connectionString: env.DATABASE_URL })
  const db = drizzle(pool, { schema })

  try {
    const centerId = await upsertCenter(db, 'המרכז', process.env.SEED_CENTER_PIN ?? '2468')
    const staffIds = {
      שרה: await upsertStaff(db, centerId, 'שרה', 'manager', process.env.SEED_STAFF_PIN ?? '1111'),
      דוד: await upsertStaff(db, centerId, 'דוד', 'staff', '2222'),
      מיכאל: await upsertStaff(db, centerId, 'מיכאל', 'staff', '3333'),
    }

    logger.info({ centerId, staffIds }, 'Seed complete')
  } finally {
    await pool.end()
  }
}

void main()
