import { env } from '../config/env'
import { usersRepository } from '../repositories/users.repository'
import { signSession } from './session.service'
import { validateTelegramInitData } from './telegram-auth.service'
import type { AuthUser } from '../types/user'
import type { TelegramUser } from '../types/telegram'
import { AppError } from '../utils/AppError'
import { bannedMessage, isUserBanned } from '../utils/ban'
import { adminRepository } from '../repositories/admin.repository'
import { hostsRepository } from '../repositories/hosts.repository'
import { vipsRepository } from '../repositories/vips.repository'

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

  const user = await usersRepository.upsertByTelegramId({
    telegramId: telegramUser.id,
    firstName: telegramUser.first_name,
    username: telegramUser.username,
    photoUrl: telegramUser.photo_url,
  })

  if (isUserBanned(user)) {
    throw new AppError(403, 'USER_BANNED', bannedMessage(user))
  }

  const [isAdmin, isHost, isVip] = await Promise.all([
    adminRepository.isAdmin(user.id),
    hostsRepository.isHost(user.id),
    vipsRepository.isVip(user.id),
  ])
  const userWithRoles = { ...user, isAdmin, isHost, isVip }
  const token = signSession({ sub: user.id, telegramId: user.telegramId }, env.JWT_SECRET)

  return { user: userWithRoles, token }
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
