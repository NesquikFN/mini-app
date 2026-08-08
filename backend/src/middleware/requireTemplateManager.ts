import type { NextFunction, Request, Response } from 'express'
import { adminRepository } from '../repositories/admin.repository'
import { hostsRepository } from '../repositories/hosts.repository'
import { AppError } from '../utils/AppError'

/**
 * Runs after requireTelegramAuth. Only guards the *mutating* template
 * routes (create/update/image/delete) — browsing and launching a
 * template from GET /api/event-templates stays open to every
 * authenticated user, see routes/event-templates.routes.ts.
 */
export async function requireTemplateManager(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const [isAdmin, isHost] = await Promise.all([
      adminRepository.isAdmin(req.user.id),
      hostsRepository.isHost(req.user.id),
    ])
    if (!isAdmin && !isHost) {
      throw new AppError(403, 'TEMPLATE_MANAGER_ACCESS_REQUIRED', 'Редагувати шаблони можуть лише адміни й хости')
    }
    next()
  } catch (error) {
    next(error)
  }
}
