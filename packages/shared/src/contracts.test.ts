import { describe, expect, it } from 'vitest'
import {
  activityEntrySchema,
  activityIdSchema,
  addToLineSchema,
  apiErrorSchema,
  captainIdSchema,
  captainSearchResultSchema,
  captainViewSchema,
  centerIdSchema,
  centerUnlockSchema,
  createCaptainSchema,
  createFieldSchema,
  endReasonSchema,
  errorCodeSchema,
  extendMatchSchema,
  fieldIdSchema,
  fieldListItemSchema,
  fieldViewSchema,
  finishMatchResultSchema,
  historyEntrySchema,
  loginSchema,
  matchIdSchema,
  matchStatusSchema,
  matchViewSchema,
  openSessionSchema,
  queueEntryIdSchema,
  queueEntryViewSchema,
  removeFromLineResultSchema,
  reorderLineResultSchema,
  reorderLineSchema,
  sessionIdSchema,
  sessionListItemSchema,
  sessionSnapshotSchema,
  sessionStatusSchema,
  sessionSummarySchema,
  staffIdSchema,
  staffRoleSchema,
  startMatchSchema,
  undoResultSchema,
  updateCaptainSchema,
  updateSessionSchema,
  visitorHelloSchema,
} from './index.js'

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
  plannedDurationSec: 360,
  startedAt: isoDateTime,
  pausedAt: null,
  accumulatedPauseSec: 0,
  endsAt: isoDateTime,
}

const validQueueEntry = {
  id: uuid3,
  position: 1,
  team: validCaptainView,
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
    ['queueEntryIdSchema', queueEntryIdSchema],
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

  it.each(['SESSION_ALREADY_ACTIVE', 'SESSION_HAS_LIVE_MATCH', 'INTERNAL_ERROR'])(
    'errorCodeSchema accepts %s',
    (code) => {
      expect(errorCodeSchema.safeParse(code).success).toBe(true)
    },
  )

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

  it('queueEntryViewSchema accepts a single-team entry and rejects position below 1', () => {
    expect(queueEntryViewSchema.safeParse(validQueueEntry).success).toBe(true)
    expect(queueEntryViewSchema.safeParse({ ...validQueueEntry, position: 0 }).success).toBe(false)
  })

  it('fieldViewSchema accepts a valid field and rejects an unknown match status inside liveMatch', () => {
    expect(fieldViewSchema.safeParse(validFieldView).success).toBe(true)
    const badLiveMatch = { ...validMatchView, status: 'bogus' }
    expect(fieldViewSchema.safeParse({ ...validFieldView, liveMatch: badLiveMatch }).success).toBe(false)
  })

  it('captainSearchResultSchema accepts a valid result and rejects more than 10 tags', () => {
    const valid = { ...validCaptainView, note: 'private note', tags: ['a', 'b'], totalMatches: 5 }
    expect(captainSearchResultSchema.safeParse(valid).success).toBe(true)
    expect(
      captainSearchResultSchema.safeParse({ ...valid, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }).success,
    ).toBe(false)
  })
})

describe('snapshot', () => {
  const validSnapshot = {
    session: {
      id: uuid1,
      slug: 'abc234',
      date: isoDate,
      location: 'Center Court',
      matchDurationSec: 360,
      status: 'active',
    },
    fields: [validFieldView],
    queue: [validQueueEntry],
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
  it('addToLineSchema accepts a team by id or by newName, rejects a plain number', () => {
    expect(addToLineSchema.safeParse({ team: uuid1 }).success).toBe(true)
    expect(addToLineSchema.safeParse({ team: { newName: 'חדש' } }).success).toBe(true)
    expect(addToLineSchema.safeParse({ team: 5 }).success).toBe(false)
  })

  it('reorderLineSchema accepts a non-empty entry-id list, rejects an empty one', () => {
    expect(reorderLineSchema.safeParse({ entryIds: [uuid1, uuid2] }).success).toBe(true)
    expect(reorderLineSchema.safeParse({ entryIds: [] }).success).toBe(false)
  })

  it('startMatchSchema accepts empty (pair front two), an explicit entry pair, rejects a malformed field', () => {
    expect(startMatchSchema.safeParse({}).success).toBe(true)
    expect(startMatchSchema.safeParse({ entryIds: [uuid1, uuid2] }).success).toBe(true)
    expect(startMatchSchema.safeParse({ entryIds: [uuid1] }).success).toBe(false)
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

  it('updateSessionSchema accepts a partial body, rejects an out-of-range duration', () => {
    expect(updateSessionSchema.safeParse({ location: 'Center Court' }).success).toBe(true)
    expect(updateSessionSchema.safeParse({}).success).toBe(true)
    expect(updateSessionSchema.safeParse({ matchDurationSec: 3601 }).success).toBe(false)
  })

  it('createCaptainSchema requires a name, accepts up to 10 tags, rejects an 11th', () => {
    expect(createCaptainSchema.safeParse({ name: 'דניאל' }).success).toBe(true)
    expect(createCaptainSchema.safeParse({ name: '' }).success).toBe(false)
    expect(
      createCaptainSchema.safeParse({ name: 'דניאל', tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }).success,
    ).toBe(false)
  })

  it('updateCaptainSchema accepts an empty partial body and a name-only update', () => {
    expect(updateCaptainSchema.safeParse({}).success).toBe(true)
    expect(updateCaptainSchema.safeParse({ name: 'רון' }).success).toBe(true)
    expect(updateCaptainSchema.safeParse({ name: '' }).success).toBe(false)
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

describe('reads', () => {
  it('activityEntrySchema accepts a valid row and rejects a missing action', () => {
    const valid = {
      id: uuid1,
      sessionId: uuid2,
      staffId: uuid3,
      action: 'line.added',
      entityType: 'queueEntry',
      entityId: uuid1,
      beforeJson: null,
      afterJson: { position: 1 },
      createdAt: isoDateTime,
    }
    expect(activityEntrySchema.safeParse(valid).success).toBe(true)
    const { action: _action, ...withoutAction } = valid
    expect(activityEntrySchema.safeParse(withoutAction).success).toBe(false)
  })

  it('historyEntrySchema accepts a valid finished match and rejects a negative duration', () => {
    const valid = {
      id: uuid1,
      captainAId: uuid2,
      captainAName: 'יוסי',
      captainBId: uuid3,
      captainBName: 'רון',
      fieldName: 'מגרש ראשי',
      startedAt: isoDateTime,
      endedAt: isoDateTime,
      endReason: 'manual',
      plannedDurationSec: 360,
      actualDurationSec: 300,
      startedByName: 'שרה',
      endedByName: null,
    }
    expect(historyEntrySchema.safeParse(valid).success).toBe(true)
    expect(historyEntrySchema.safeParse({ ...valid, actualDurationSec: -1 }).success).toBe(false)
  })

  it('sessionListItemSchema accepts a valid row and rejects a bad status', () => {
    const valid = { id: uuid1, date: isoDate, location: null, status: 'closed', matchCount: 4 }
    expect(sessionListItemSchema.safeParse(valid).success).toBe(true)
    expect(sessionListItemSchema.safeParse({ ...valid, status: 'bogus' }).success).toBe(false)
  })
})

describe('results', () => {
  it('removeFromLineResultSchema accepts an activityId, rejects a non-uuid', () => {
    expect(removeFromLineResultSchema.safeParse({ activityId: uuid1 }).success).toBe(true)
    expect(removeFromLineResultSchema.safeParse({ activityId: 'nope' }).success).toBe(false)
  })

  it('reorderLineResultSchema accepts an activityId, rejects a non-uuid', () => {
    expect(reorderLineResultSchema.safeParse({ activityId: uuid1 }).success).toBe(true)
    expect(reorderLineResultSchema.safeParse({ activityId: 'nope' }).success).toBe(false)
  })

  it('finishMatchResultSchema accepts a match+activityId, rejects a missing match', () => {
    expect(finishMatchResultSchema.safeParse({ match: validMatchView, activityId: uuid1 }).success).toBe(true)
    expect(finishMatchResultSchema.safeParse({ activityId: uuid1 }).success).toBe(false)
  })

  it('undoResultSchema accepts {ok:true}, rejects {ok:false}', () => {
    expect(undoResultSchema.safeParse({ ok: true }).success).toBe(true)
    expect(undoResultSchema.safeParse({ ok: false }).success).toBe(false)
  })
})

const validSnapshotFixture = () => ({
  session: {
    id: uuid1,
    slug: 'abc234',
    date: isoDate,
    location: 'Center Court',
    matchDurationSec: 360,
    status: 'active',
  },
  fields: [validFieldView],
  queue: [validQueueEntry],
  emittedAt: isoDateTime,
  serverNow: isoDateTime,
})

describe('open-fields contracts', () => {
  it('staff role accepts visitor', () => {
    expect(staffRoleSchema.parse('visitor')).toBe('visitor')
  })

  it('error codes accept FIELD_CLOSED', () => {
    expect(errorCodeSchema.parse('FIELD_CLOSED')).toBe('FIELD_CLOSED')
  })

  it('createFieldSchema: valid body parses, bad duration rejected', () => {
    // Import will be added; test will fail initially
    expect(createFieldSchema.parse({ name: 'מגרש בית ספר', matchDurationSec: 360 })).toEqual({
      name: 'מגרש בית ספר',
      matchDurationSec: 360,
    })
    expect(createFieldSchema.safeParse({ name: '', matchDurationSec: 360 }).success).toBe(false)
    expect(createFieldSchema.safeParse({ name: 'x', matchDurationSec: 30 }).success).toBe(false)
  })

  it('visitorHelloSchema: 1..30 chars', () => {
    expect(visitorHelloSchema.parse({ nickname: 'אורח 42' })).toEqual({ nickname: 'אורח 42' })
    expect(visitorHelloSchema.safeParse({ nickname: '' }).success).toBe(false)
    expect(visitorHelloSchema.safeParse({ nickname: 'x'.repeat(31) }).success).toBe(false)
  })

  it('fieldListItemSchema parses a list row', () => {
    expect(
      fieldListItemSchema.parse({
        slug: 'abc234',
        name: 'מגרש',
        createdAt: '2026-07-16T10:00:00.000Z',
        queueLength: 3,
        hasLiveMatch: true,
      }).slug,
    ).toBe('abc234')
  })

  it('snapshot session requires slug', () => {
    const base = validSnapshotFixture()
    expect(sessionSnapshotSchema.parse(base).session.slug).toBe('abc234')
    const { slug: _omitted, ...withoutSlug } = base.session
    expect(sessionSnapshotSchema.safeParse({ ...base, session: withoutSlug }).success).toBe(false)
  })
})
