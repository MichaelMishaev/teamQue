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
import { randomUUID } from 'node:crypto'
import { ArgumentsHost, Catch, HttpException, Inject, Optional, type ExceptionFilter } from '@nestjs/common'
import type { Request, Response } from 'express'
import pino from 'pino'
import type { ApiError, ErrorCode } from 'shared'
import { ExceptionActivityWriter } from '../activity/exception-activity.writer'
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
  constructor(
    @Optional() @Inject(ExceptionActivityWriter) private readonly exceptionActivity?: ExceptionActivityWriter,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const http = host.switchToHttp()
    const response = http.getResponse<Response>()
    const request = typeof http.getRequest === 'function' ? http.getRequest<Request>() : undefined
    const mapped = mapException(exception)
    const canPersist = this.exceptionActivity !== undefined && typeof request?.centerId === 'string'
    const correlationId = canPersist ? randomUUID() : undefined

    if (exception instanceof Error && mapped.status >= 500) {
      logger.error({ err: exception, correlationId }, 'Unhandled exception')
    } else if (!(exception instanceof DomainError) && !(exception instanceof HttpException)) {
      logger.error({ err: exception, correlationId }, 'Unhandled exception')
    }

    if (correlationId && this.exceptionActivity && request) {
      const requestMethod = request.method.toUpperCase()
      const requestPath = normalizeRequestPath(request.originalUrl)
      const sessionId = sessionIdFromRequest(request, requestPath)
      try {
        await this.exceptionActivity.write({
          centerId: request.centerId as string,
          ...(sessionId ? { sessionId } : {}),
          ...(request.staff?.staffId ? { staffId: request.staff.staffId } : {}),
          outcome: mapped.status >= 500 ? 'failed' : 'rejected',
          action: `${requestMethod} ${requestPath}`,
          statusCode: mapped.status,
          errorCode: mapped.errorCode,
          requestMethod,
          requestPath,
          correlationId,
        })
      } catch (auditError) {
        logger.error({ err: auditError, correlationId }, 'Failed to persist exception activity')
      }
    }

    if (correlationId && typeof response.setHeader === 'function') {
      response.setHeader('X-Correlation-Id', correlationId)
    }
    const body = correlationId ? { ...mapped.body, correlationId } : mapped.body
    response.status(mapped.status).json(body)
  }
}

interface MappedException {
  status: number
  errorCode: ErrorCode
  body: ApiError | { message: string }
}

function mapException(exception: unknown): MappedException {
  if (exception instanceof DomainError) {
    return {
      status: exception.httpStatus,
      errorCode: exception.code,
      body: {
        code: exception.code,
        message: exception.message,
        details: exception.details,
      },
    }
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus()
    const code = mapStatusToCode(status)
    return {
      status,
      errorCode: code ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED'),
      body: code ? { code, message: exception.message } : { message: exception.message },
    }
  }

  return {
    status: 500,
    errorCode: 'INTERNAL_ERROR',
    body: { code: 'INTERNAL_ERROR', message: 'unexpected error' },
  }
}

const UUID_SEGMENT = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi

/** Remove query values and replace UUID path segments so filters never store personal/entity ids. */
function normalizeRequestPath(originalUrl: string): string {
  const [path = '/'] = originalUrl.split('?')
  return path.replace(UUID_SEGMENT, ':id')
}

function sessionIdFromRequest(request: Request, normalizedPath: string): string | undefined {
  if (!normalizedPath.startsWith('/sessions/:id')) return undefined
  const candidate = request.params.id
  return typeof candidate === 'string' && new RegExp(`^${UUID_SEGMENT.source}$`, 'i').test(candidate)
    ? candidate
    : undefined
}
