import type { NextFunction, Request, Response } from 'express'
import { adminRepository } from '../repositories/admin.repository'
import { AppError } from '../utils/AppError'

/**
 * Ручна модерація реєстрації як серверна перевірка, а не лише
 * RegistrationGate у frontend: маючи валідну Telegram-підпис, будь-хто
 * отримує сесійний токен (auth.service), тож без цього middleware
 * несхвалений користувач міг би звертатись до захищеного API напряму,
 * повз React-гейт.
 *
 * Ставиться ПІСЛЯ requireTelegramAuth і користується вже завантаженим
 * req.user — жодного повторного розбору токена тут немає. Бан
 * перевіряється раніше (requireTelegramAuth), тож забанений отримає
 * USER_BANNED, а не REGISTRATION_REQUIRED.
 */
export async function requireApprovedUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user.registrationStatus === 'approved') {
      next()
      return
    }

    // Запасний шлях лише для несхвалених: адміністратор не повинен
    // втратити доступ через застарілий чи некоректний
    // registration_status у старих рядках (наприклад, якщо бекфіл
    // migrations/0019 колись не зачепив його запис). Схвалені
    // користувачі — переважна більшість запитів — виходять вище й цього
    // додаткового запиту до admin_users не роблять.
    if (await adminRepository.isAdmin(req.user.id)) {
      next()
      return
    }

    // Навмисно не повідомляємо конкретний статус (not_submitted /
    // pending / rejected) — цього достатньо для frontend, який і так
    // читає власний статус із GET /api/me.
    throw new AppError(
      403,
      'REGISTRATION_REQUIRED',
      'Доступ відкриється після схвалення заявки адміністратором',
    )
  } catch (error) {
    next(error)
  }
}
