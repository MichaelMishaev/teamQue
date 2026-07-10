/**
 * Nest pipe that validates @Body() (or any argument) against a shared zod
 * schema (technical-prd §9: "all input validated at the boundary with zod
 * schemas from packages/shared"). Usage: @Body(new ZodValidationPipe(schema)).
 */
import { Injectable, type PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'
import { ValidationFailedError } from './errors'

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value)

    if (!result.success) {
      throw new ValidationFailedError('Validation failed', result.error.issues)
    }

    return result.data
  }
}
