/**
 * Cross-cutting domain errors shared by every module's guards/pipes
 * (technical-prd §8: auth → 401/403; request validation → 400).
 */
import { DomainError } from './domain-error'

export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED' as const
  readonly httpStatus = 401

  constructor(message = 'Unauthorized') {
    super(message)
  }
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN' as const
  readonly httpStatus = 403

  constructor(message = 'Forbidden') {
    super(message)
  }
}

export class ValidationFailedError extends DomainError {
  readonly code = 'VALIDATION_FAILED' as const
  readonly httpStatus = 400

  constructor(message: string, details?: unknown) {
    super(message, details)
  }
}

/**
 * A resource that doesn't exist OR belongs to another center (technical-prd
 * §6/§9: center scoping). The two cases are deliberately indistinguishable
 * to the caller — otherwise the response would leak cross-center existence.
 */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND' as const
  readonly httpStatus = 404

  constructor(message = 'Not found') {
    super(message)
  }
}
