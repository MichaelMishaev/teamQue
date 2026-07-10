/**
 * Base for typed domain errors (technical-prd §8, R-17). Subclasses fix
 * `code` (the client's i18n key input, from shared's error code enum) and
 * `httpStatus`; the global exception filter maps instances of this class
 * straight to their status/body.
 */
import type { ErrorCode } from 'shared'

export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode
  abstract readonly httpStatus: number
  readonly details?: unknown

  constructor(message: string, details?: unknown) {
    super(message)
    this.name = new.target.name
    this.details = details
  }
}
