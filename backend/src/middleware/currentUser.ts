import type { NextFunction, Request, Response } from 'express'
import { getCurrentUser } from '../services/auth.service'

export async function currentUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    req.user = await getCurrentUser()
    next()
  } catch (error) {
    next(error)
  }
}
