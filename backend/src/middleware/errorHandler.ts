import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../utils/AppError'
import { env } from '../config/env'

/**
 * Помилки body-parser (express.json / express.raw) не є ні AppError, ні
 * ZodError, тож без цієї гілки завеликий чи побитий payload віддавав би
 * 500 «Внутрішня помилка сервера» замість чесних 413/400 — і засмічував
 * би логи як «невідома помилка».
 */
interface BodyParserError extends Error {
  status?: number
  statusCode?: number
  type?: string
}

const BODY_PARSER_CODES: Record<string, string> = {
  'entity.too.large': 'PAYLOAD_TOO_LARGE',
  'entity.parse.failed': 'INVALID_JSON',
  'encoding.unsupported': 'UNSUPPORTED_ENCODING',
  'request.aborted': 'REQUEST_ABORTED',
}

const BODY_PARSER_MESSAGES: Record<string, string> = {
  'entity.too.large': 'Файл або тіло запиту завеликі',
  'entity.parse.failed': 'Некоректний JSON у тілі запиту',
  'encoding.unsupported': 'Непідтримуване кодування запиту',
  'request.aborted': 'Запит перервано',
}

function asClientError(err: unknown): { status: number; code: string; message: string } | null {
  if (!(err instanceof Error)) return null
  const candidate = err as BodyParserError
  const status = candidate.status ?? candidate.statusCode
  if (typeof status !== 'number' || status < 400 || status >= 500) return null

  const type = candidate.type
  return {
    status,
    code: (type && BODY_PARSER_CODES[type]) ?? 'BAD_REQUEST',
    // Власне формулювання, а не err.message: сирі тексти body-parser
    // містять деталі про ліміти й внутрішній стан парсера.
    message: (type && BODY_PARSER_MESSAGES[type]) ?? 'Некоректний запит',
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Некоректні дані запиту',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    })
    return
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message },
    })
    return
  }

  const clientError = asClientError(err)
  if (clientError) {
    res.status(clientError.status).json({
      error: { code: clientError.code, message: clientError.message },
    })
    return
  }

  console.error(err)

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Внутрішня помилка сервера',
      ...(env.NODE_ENV !== 'production' && err instanceof Error ? { stack: err.stack } : {}),
    },
  })
}
