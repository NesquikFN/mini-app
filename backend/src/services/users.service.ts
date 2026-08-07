import { usersRepository } from '../repositories/users.repository'
import { dormitoriesRepository } from '../repositories/dormitories.repository'
import { AppError } from '../utils/AppError'
import type { AuthUser } from '../types/user'

export async function updateDormitory(userId: string, dormitoryId: string): Promise<AuthUser> {
  // Явна перевірка існування замість покладання на FK-помилку з Postgres
  // — так користувач отримує зрозумілу 400-помилку, а не сиру 500.
  const exists = await dormitoriesRepository.exists(dormitoryId)
  if (!exists) {
    throw new AppError(400, 'DORMITORY_NOT_FOUND', 'Такого гуртожитку не існує')
  }

  return usersRepository.setDormitory(userId, dormitoryId)
}
