/**
 * Match-lifecycle errors (kickoff + pause/resume/extend/finish/replay).
 */
import { DomainError } from '../common/domain-error'

/** POST /sessions/:id/start when the line doesn't have two teams to pair
 * (front-two default, or a named entryId is no longer in the line —
 * already consumed by a concurrent start). */
export class LineTooShortError extends DomainError {
  readonly code = 'LINE_TOO_SHORT' as const
  readonly httpStatus = 409

  constructor(message = 'The line does not have two teams to pair') {
    super(message)
  }
}

/** POST /sessions/:id/start when the session's field already has a
 * live/paused match; also the undo of match.finished when a new match
 * started on the field in the meantime. */
export class FieldOccupiedError extends DomainError {
  readonly code = 'FIELD_OCCUPIED' as const
  readonly httpStatus = 409

  constructor(message = 'The field already has a live match') {
    super(message)
  }
}

/** Defensive guard on POST /sessions/:id/start: a captain picked from the
 * line is somehow already live/paused elsewhere in the session. Shouldn't
 * happen (line entries and playing captains are disjoint by construction)
 * but the DB is the source of truth, not the assumption. */
export class CaptainAlreadyPlayingError extends DomainError {
  readonly code = 'CAPTAIN_ALREADY_PLAYING' as const
  readonly httpStatus = 409

  constructor(message = 'A captain is already playing') {
    super(message)
  }
}

/** pause/resume/extend/finish/replay attempted from a status that doesn't
 * allow it (e.g. pausing a finished match). */
export class InvalidTransitionError extends DomainError {
  readonly code = 'INVALID_TRANSITION' as const
  readonly httpStatus = 409

  constructor(message = 'Invalid match state transition') {
    super(message)
  }
}
