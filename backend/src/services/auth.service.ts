import type { AuthUser } from '../types/user'

const MOCK_USER: AuthUser = {
  id: 'user-1',
  telegramId: 123456789,
  firstName: 'Тимофій',
  username: 'demo_user',
}

export function getCurrentUser(): AuthUser {
  return MOCK_USER
}
