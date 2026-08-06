import type { NextFunction, Request, Response } from 'express'
import { adminRepository } from '../repositories/admin.repository'
import { AppError } from '../utils/AppError'

/** Runs after requireTelegramAuth (needs req.user already set). Being a
 * valid, authenticated Telegram user is not enough for /api/admin/* — the
 * user's id must also be present in admin_users. */
export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const isAdmin = await adminRepository.isAdmin(req.user.id)
    if (!isAdmin) {
      throw new AppError(403, 'FORBIDDEN', 'Потрібні права адміністратора')
    }
    next()
  } catch (error) {
    next(error)
  }
}
