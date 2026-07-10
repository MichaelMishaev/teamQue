/**
 * Session-domain errors (technical-prd §3/§7/§8, US-010/011/012).
 */
import { DomainError } from '../common/domain-error'

/** POST /sessions when the center already has an active session — the DB's
 * partial unique index (`one_active_session`) is the real guard; this is
 * just its 409 mapping. */
export class SessionAlreadyActiveError extends DomainError {
  readonly code = 'SESSION_ALREADY_ACTIVE' as const
  readonly httpStatus = 409

  constructor(message = 'An active session already exists for this center') {
    super(message)
  }
}

/** PATCH/close on a session that is already closed. */
export class SessionClosedError extends DomainError {
  readonly code = 'SESSION_CLOSED' as const
  readonly httpStatus = 409

  constructor(message = 'Session is closed') {
    super(message)
  }
}

/** close on a session with a live/paused match still in it (US-011). */
export class SessionHasLiveMatchError extends DomainError {
  readonly code = 'SESSION_HAS_LIVE_MATCH' as const
  readonly httpStatus = 409

  constructor(message = 'Session has a live or paused match') {
    super(message)
  }
}
