/**
 * Auth-domain error (technical-prd §6/§8). PIN_LOCKED carries retryAfterSec
 * so the client can render a countdown without polling.
 */
import { DomainError } from '../common/domain-error'

export class PinLockedError extends DomainError {
  readonly code = 'PIN_LOCKED' as const
  readonly httpStatus = 423

  constructor(retryAfterSec: number) {
    super('PIN locked due to too many failed attempts', { retryAfterSec })
  }
}
