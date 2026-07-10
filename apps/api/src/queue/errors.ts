/**
 * Line-domain errors (line-manager model).
 */
import { DomainError } from '../common/domain-error'

/** PATCH /sessions/:id/line when entryIds isn't a permutation of the
 * CURRENT line — someone else mutated it first. Same error code as request
 * validation (VALIDATION_FAILED) but 409, not 400: the body was
 * well-formed, it's just stale. The client refetches via the snapshot. */
export class ReorderMismatchError extends DomainError {
  readonly code = 'VALIDATION_FAILED' as const
  readonly httpStatus = 409

  constructor(message = 'entryIds do not match the current line; refetch the snapshot') {
    super(message)
  }
}
