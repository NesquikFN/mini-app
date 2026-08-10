import './testEnv'
import { mock } from 'node:test'
import { signSession } from '../services/session.service'
import { usersRepository } from '../repositories/users.repository'
import { adminRepository } from '../repositories/admin.repository'
import { hostsRepository } from '../repositories/hosts.repository'
import { vipsRepository } from '../repositories/vips.repository'
import type { AuthUser, RegistrationStatus } from '../types/user'

/**
 * Тести ходять через справжній Express-застосунок і справжній ланцюг
 * middleware — підмінюється лише шар доступу до даних (репозиторії).
 * Так перевіряється саме бойовий код авторизації, а не його копія.
 */

export const TEST_JWT_SECRET = 'security-test-secret-not-used-anywhere-real'

let userCounter = 0

export function buildUser(overrides: Partial<AuthUser> = {}): AuthUser {
  userCounter += 1
  return {
    id: `00000000-0000-0000-0000-${String(userCounter).padStart(12, '0')}`,
    telegramId: 900_100_000 + userCounter,
    firstName: 'Тест',
    registrationStatus: 'approved',
    bannedPermanently: false,
    notifyNewEvents: false,
    dormitoryId: '00000000-0000-0000-0000-000000000101',
    ...overrides,
  }
}

export function tokenFor(user: AuthUser): string {
  return signSession({ sub: user.id, telegramId: user.telegramId }, TEST_JWT_SECRET)
}

export function userWithStatus(status: RegistrationStatus): AuthUser {
  return buildUser({ registrationStatus: status })
}

/**
 * Підміняє лише читання користувача й ролей. requireTelegramAuth,
 * requireApprovedUser, requireAdmin, лімітери та контролери лишаються
 * справжніми.
 */
export function stubAuthLayer(options: {
  users: AuthUser[]
  admins?: string[]
  hosts?: string[]
  vips?: string[]
}): void {
  const byId = new Map(options.users.map((user) => [user.id, user]))
  const admins = new Set(options.admins ?? [])
  const hosts = new Set(options.hosts ?? [])
  const vips = new Set(options.vips ?? [])

  mock.method(usersRepository, 'getUserById', async (id: string) => byId.get(id) ?? null)
  mock.method(adminRepository, 'isAdmin', async (id: string) => admins.has(id))
  mock.method(hostsRepository, 'isHost', async (id: string) => hosts.has(id))
  mock.method(vipsRepository, 'isVip', async (id: string) => vips.has(id))
}

export interface ApiErrorBody {
  error: { code: string; message: string }
}
