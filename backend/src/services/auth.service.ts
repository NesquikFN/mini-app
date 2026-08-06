import { usersRepository } from '../repositories/users.repository'
import type { AuthUser } from '../types/user'

// Поки що немає Telegram-авторизації (Етап 7), тому весь backend працює
// від імені одного mock-мешканця. telegramId має збігатися з рядком у
// database/seed.sql, інакше при першому запиті буде автоматично
// створено новий рядок users із цими даними.
const MOCK_TELEGRAM_PROFILE = {
  telegramId: 123456789,
  firstName: 'Тимофій',
  username: 'demo_user',
}

let cachedUser: AuthUser | null = null

export async function getCurrentUser(): Promise<AuthUser> {
  if (cachedUser) {
    return cachedUser
  }

  const existing = await usersRepository.getUserByTelegramId(MOCK_TELEGRAM_PROFILE.telegramId)
  cachedUser = existing ?? (await usersRepository.createUser(MOCK_TELEGRAM_PROFILE))

  return cachedUser
}
