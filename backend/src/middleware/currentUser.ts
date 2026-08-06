import type { NextFunction, Request, Response } from 'express'
import { getCurrentUser } from '../services/auth.service'

export function currentUser(req: Request, _res: Response, next: NextFunction): void {
  req.user = getCurrentUser()
  next()
}
