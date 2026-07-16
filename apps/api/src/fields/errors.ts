/** Open-fields domain errors (spec §6). */
import { DomainError } from '../common/domain-error'

/** Mutation on a closed field. */
export class FieldClosedError extends DomainError {
  readonly code = 'FIELD_CLOSED' as const
  readonly httpStatus = 409

  constructor(message = 'Field is closed') {
    super(message)
  }
}
