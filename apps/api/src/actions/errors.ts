/**
 * Undo-domain errors.
 */
import { DomainError } from '../common/domain-error'

/** POST /actions/:activityId/undo when the window has passed, the
 * underlying state has been superseded by a later mutation, the activity
 * was already undone, or the action isn't one of the undoable kinds
 * (line.removed, line.reordered, match.finished manual). */
export class UndoExpiredError extends DomainError {
  readonly code = 'UNDO_EXPIRED' as const
  readonly httpStatus = 409

  constructor(message = 'This action can no longer be undone') {
    super(message)
  }
}
