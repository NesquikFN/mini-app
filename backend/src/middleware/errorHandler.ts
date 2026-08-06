import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../utils/AppError'
import { env } from '../config/env'

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

  console.error(err)

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Внутрішня помилка сервера',
      ...(env.NODE_ENV !== 'production' && err instanceof Error ? { stack: err.stack } : {}),
    },
  })
}
