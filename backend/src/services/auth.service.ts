import { env } from '../config/env'
import { usersRepository } from '../repositories/users.repository'
import { signSession } from './session.service'
import { validateTelegramInitData } from './telegram-auth.service'
import type { AuthUser } from '../types/user'
import type { TelegramUser } from '../types/telegram'
import { AppError } from '../utils/AppError'
import { bannedMessage, isUserBanned } from '../utils/ban'

/**
 * Local-dev-only stand-in profile. Only reachable when
 * `isDevAuthEnabled()` is true, which itself requires NODE_ENV !==
 * 'production' — checked in code, not just by omitting the env var — so
 * it cannot be enabled by a misconfigured production deploy.
 */
const DEV_TELEGRAM_USER: TelegramUser = {
  id: 123456789,
  first_name: 'Тимофій',
  username: 'demo_user',
}

export interface TelegramAuthResult {
  user: AuthUser
  token: string
}

export async function authenticateTelegramUser(initData: unknown): Promise<TelegramAuthResult> {
  const telegramUser = resolveTelegramUser(initData)

  const existing = await usersRepository.getUserByTelegramId(telegramUser.id)
  // Telegram надсилає поточні first_name/username/photo_url при кожному
  // вході — синхронізуємо збережений профіль, а не лише створюємо його
  // один раз, інакше зміна імені чи аватара в Telegram ніколи б не
  // відобразилась у DormHub.
  const user = existing
    ? await usersRepository.updateProfile(existing.id, {
        firstName: telegramUser.first_name,
        username: telegramUser.username,
        photoUrl: telegramUser.photo_url,
      })
    : await usersRepository.createUser({
        telegramId: telegramUser.id,
        firstName: telegramUser.first_name,
        username: telegramUser.username,
        photoUrl: telegramUser.photo_url,
      })

  if (isUserBanned(user)) {
    throw new AppError(403, 'USER_BANNED', bannedMessage(user))
  }

  const token = signSession({ sub: user.id, telegramId: user.telegramId }, env.JWT_SECRET)

  return { user, token }
}

function resolveTelegramUser(initData: unknown): TelegramUser {
  if (!initData) {
    if (isDevAuthEnabled()) {
      return DEV_TELEGRAM_USER
    }
    throw new AppError(400, 'VALIDATION_ERROR', 'initData обовʼязковий')
  }

  return validateTelegramInitData(initData, env.BOT_TOKEN).user
}

function isDevAuthEnabled(): boolean {
  return env.NODE_ENV !== 'production' && env.DEV_AUTH
}
