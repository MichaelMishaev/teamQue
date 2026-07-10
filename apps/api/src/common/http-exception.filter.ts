/**
 * Global exception filter (technical-prd §8): DomainError → its own
 * status/body; other Nest HttpExceptions → best-effort structured body
 * using shared's error codes where one exists (e.g. ThrottlerException's
 * 429 → RATE_LIMITED); anything else → 500, logged, generic body.
 *
 * Logs via a plain pino instance rather than nestjs-pino's PinoLogger:
 * PinoLogger is request-scoped (for per-request context binding) and can't
 * be constructor-injected into a singleton APP_FILTER. Same pattern as
 * config/env.ts's bootstrap-time logging.
 */
import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import pino from 'pino'
import type { ApiError, ErrorCode } from 'shared'
import { DomainError } from './domain-error'

const logger = pino()

function mapStatusToCode(status: number): ErrorCode | undefined {
  switch (status) {
    case 400:
      return 'VALIDATION_FAILED'
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 423:
      return 'PIN_LOCKED'
    case 429:
      return 'RATE_LIMITED'
    default:
      return undefined
  }
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()

    if (exception instanceof DomainError) {
      const body: ApiError = {
        code: exception.code,
        message: exception.message,
        details: exception.details,
      }
      response.status(exception.httpStatus).json(body)
      return
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const code = mapStatusToCode(status)
      const body: ApiError | { message: string } = code
        ? { code, message: exception.message }
        : { message: exception.message }
      response.status(status).json(body)
      return
    }

    logger.error({ err: exception }, 'Unhandled exception')
    response.status(500).json({ message: 'Internal server error' })
  }
}
