import { describe, expect, it } from 'vitest'
import {
  activityIdSchema,
  apiErrorSchema,
  captainIdSchema,
  captainViewSchema,
  centerIdSchema,
  centerUnlockSchema,
  endReasonSchema,
  errorCodeSchema,
  extendMatchSchema,
  fieldIdSchema,
  fieldViewSchema,
  loginSchema,
  matchIdSchema,
  matchStatusSchema,
  matchViewSchema,
  openSessionSchema,
  quickAddMatchSchema,
  reorderQueueSchema,
  sessionIdSchema,
  sessionSnapshotSchema,
  sessionStatusSchema,
  sessionSummarySchema,
  staffIdSchema,
  staffRoleSchema,
  startMatchSchema,
} from './index'

const uuid1 = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
const uuid2 = '4c2f9b1a-6e21-4a3d-9f3a-1b2c3d4e5f60'
const uuid3 = '9e107d9d-372b-4b76-8b53-01a9b0c0f9f1'
const isoDateTime = '2026-07-10T18:55:23.000Z'
const isoDate = '2026-07-10'

const validCaptainView = {
  id: uuid1,
  name: 'יוסי',
  nickname: null,
  gamesToday: 2,
  lastPlayedAt: isoDateTime,
}

const validMatchView = {
  id: uuid2,
  captainA: validCaptainView,
  captainB: { ...validCaptainView, id: uuid3, name: 'רון' },
  status: 'live',
  queuePosition: null,
  plannedDurationSec: 360,
  startedAt: isoDateTime,
  pausedAt: null,
  accumulatedPauseSec: 0,
  endsAt: isoDateTime,
}

const validFieldView = {
  id: uuid1,
  name: 'מגרש 1',
  position: 0,
  liveMatch: validMatchView,
}

describe('ids', () => {
  it.each([
    ['centerIdSchema', centerIdSchema],
    ['staffIdSchema', staffIdSchema],
    ['captainIdSchema', captainIdSchema],
    ['sessionIdSchema', sessionIdSchema],
    ['fieldIdSchema', fieldIdSchema],
    ['matchIdSchema', matchIdSchema],
    ['activityIdSchema', activityIdSchema],
  ])('%s accepts a valid uuid and rejects a bad one', (_name, schema) => {
    expect(schema.safeParse(uuid1).success).toBe(true)
    expect(schema.safeParse('not-a-uuid').success).toBe(false)
  })
})

describe('enums', () => {
  it('matchStatusSchema accepts known values, rejects unknown', () => {
    expect(matchStatusSchema.safeParse('live').success).toBe(true)
    expect(matchStatusSchema.safeParse('bogus').success).toBe(false)
  })

  it('endReasonSchema accepts known values, rejects unknown', () => {
    expect(endReasonSchema.safeParse('auto').success).toBe(true)
    expect(endReasonSchema.safeParse('bogus').success).toBe(false)
  })

  it('staffRoleSchema accepts known values, rejects unknown', () => {
    expect(staffRoleSchema.safeParse('manager').success).toBe(true)
    expect(staffRoleSchema.safeParse('bogus').success).toBe(false)
  })

  it('sessionStatusSchema accepts known values, rejects unknown', () => {
    expect(sessionStatusSchema.safeParse('active').success).toBe(true)
    expect(sessionStatusSchema.safeParse('bogus').success).toBe(false)
  })
})

describe('errors', () => {
  it('errorCodeSchema accepts known codes, rejects unknown', () => {
    expect(errorCodeSchema.safeParse('CAPTAIN_ALREADY_PLAYING').success).toBe(true)
    expect(errorCodeSchema.safeParse('BOGUS_CODE').success).toBe(false)
  })

  it('apiErrorSchema accepts a valid shape and rejects an unknown code', () => {
    const valid = { code: 'NOT_FOUND', message: 'missing', details: { id: uuid1 } }
    expect(apiErrorSchema.safeParse(valid).success).toBe(true)
    expect(apiErrorSchema.safeParse({ code: 'BOGUS', message: 'x' }).success).toBe(false)
  })
})

describe('views', () => {
  it('captainViewSchema accepts a valid captain and rejects an empty name', () => {
    expect(captainViewSchema.safeParse(validCaptainView).success).toBe(true)
    expect(captainViewSchema.safeParse({ ...validCaptainView, name: '' }).success).toBe(false)
  })

  it('matchViewSchema accepts a valid match and rejects a negative planned duration', () => {
    expect(matchViewSchema.safeParse(validMatchView).success).toBe(true)
    expect(matchViewSchema.safeParse({ ...validMatchView, plannedDurationSec: -1 }).success).toBe(false)
  })

  it('fieldViewSchema accepts a valid field and rejects an unknown match status inside liveMatch', () => {
    expect(fieldViewSchema.safeParse(validFieldView).success).toBe(true)
    const badLiveMatch = { ...validMatchView, status: 'bogus' }
    expect(fieldViewSchema.safeParse({ ...validFieldView, liveMatch: badLiveMatch }).success).toBe(false)
  })
})

describe('snapshot', () => {
  const validSnapshot = {
    session: {
      id: uuid1,
      date: isoDate,
      location: 'Center Court',
      matchDurationSec: 360,
      status: 'active',
    },
    fields: [validFieldView],
    queue: [validMatchView],
    emittedAt: isoDateTime,
    serverNow: isoDateTime,
  }

  it('sessionSnapshotSchema accepts a full valid snapshot', () => {
    expect(sessionSnapshotSchema.safeParse(validSnapshot).success).toBe(true)
  })

  it('sessionSnapshotSchema rejects a snapshot missing serverNow', () => {
    const { serverNow: _serverNow, ...withoutServerNow } = validSnapshot
    expect(sessionSnapshotSchema.safeParse(withoutServerNow).success).toBe(false)
  })
})

describe('requests', () => {
  it('quickAddMatchSchema accepts captains by id or by newName, rejects a plain number', () => {
    expect(quickAddMatchSchema.safeParse({ captainA: uuid1, captainB: { newName: 'חדש' } }).success).toBe(true)
    expect(quickAddMatchSchema.safeParse({ captainA: 5, captainB: uuid2 }).success).toBe(false)
  })

  it('reorderQueueSchema accepts a non-empty id list, rejects an empty one', () => {
    expect(reorderQueueSchema.safeParse({ matchIds: [uuid1, uuid2] }).success).toBe(true)
    expect(reorderQueueSchema.safeParse({ matchIds: [] }).success).toBe(false)
  })

  it('startMatchSchema accepts an omitted fieldId, rejects a malformed one', () => {
    expect(startMatchSchema.safeParse({}).success).toBe(true)
    expect(startMatchSchema.safeParse({ fieldId: 'not-a-uuid' }).success).toBe(false)
  })

  it('extendMatchSchema accepts a positive addSec, rejects zero', () => {
    expect(extendMatchSchema.safeParse({ addSec: 60 }).success).toBe(true)
    expect(extendMatchSchema.safeParse({ addSec: 0 }).success).toBe(false)
  })

  it('loginSchema accepts a 4-digit pin, rejects a 3-digit one', () => {
    expect(loginSchema.safeParse({ staffId: uuid1, pin: '1234' }).success).toBe(true)
    expect(loginSchema.safeParse({ staffId: uuid1, pin: '123' }).success).toBe(false)
  })

  it('centerUnlockSchema accepts a 4-12 char pin, rejects a 3-char one', () => {
    expect(centerUnlockSchema.safeParse({ pin: '1234' }).success).toBe(true)
    expect(centerUnlockSchema.safeParse({ pin: '123' }).success).toBe(false)
  })

  it('openSessionSchema accepts a valid duration, rejects one below the 60s floor', () => {
    expect(openSessionSchema.safeParse({ matchDurationSec: 360 }).success).toBe(true)
    expect(openSessionSchema.safeParse({ matchDurationSec: 30 }).success).toBe(false)
  })
})

describe('summary', () => {
  const validSummary = {
    totalMatches: 12,
    uniqueCaptains: 8,
    totalPlaySec: 4320,
    firstMatchAt: isoDateTime,
    lastMatchEndedAt: isoDateTime,
    avgActualDurationSec: 300.5,
    topCaptains: [{ captainId: uuid1, name: 'יוסי', games: 3 }],
    extensions: 2,
    manualFinishes: 5,
    autoFinishes: 7,
  }

  it('sessionSummarySchema accepts a valid summary', () => {
    expect(sessionSummarySchema.safeParse(validSummary).success).toBe(true)
  })

  it('sessionSummarySchema rejects a negative totalPlaySec', () => {
    expect(sessionSummarySchema.safeParse({ ...validSummary, totalPlaySec: -1 }).success).toBe(false)
  })
})
