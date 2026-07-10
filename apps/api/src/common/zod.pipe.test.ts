/**
 * Unit test: ZodValidationPipe parses @Body() payloads against a shared zod
 * schema; on failure it throws ValidationFailedError shaped for the global
 * exception filter (technical-prd §8/§9 — 400 VALIDATION_FAILED).
 */
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { ValidationFailedError } from './errors'
import { ZodValidationPipe } from './zod.pipe'

const schema = z.object({ pin: z.string().regex(/^\d{4}$/) })

describe('ZodValidationPipe', () => {
  it('returns the parsed value when the input is valid', () => {
    const pipe = new ZodValidationPipe(schema)

    expect(pipe.transform({ pin: '1234' })).toEqual({ pin: '1234' })
  })

  it('throws ValidationFailedError with issue details when the input is invalid', () => {
    const pipe = new ZodValidationPipe(schema)

    expect(() => pipe.transform({ pin: 'abc' })).toThrow(ValidationFailedError)
    try {
      pipe.transform({ pin: 'abc' })
      throw new Error('expected transform to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationFailedError)
      const domainError = error as ValidationFailedError
      expect(domainError.code).toBe('VALIDATION_FAILED')
      expect(domainError.httpStatus).toBe(400)
      expect(domainError.details).toBeDefined()
    }
  })

  it('rejects a missing required field', () => {
    const pipe = new ZodValidationPipe(schema)

    expect(() => pipe.transform({})).toThrow(ValidationFailedError)
  })
})
