import type { Request, Response } from 'express'

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Маршрут ${req.method} ${req.originalUrl} не знайдено`,
    },
  })
}
