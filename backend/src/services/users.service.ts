import { usersRepository } from '../repositories/users.repository'
import { dormitoriesRepository } from '../repositories/dormitories.repository'
import { AppError } from '../utils/AppError'
import type { AuthUser, PublicUser } from '../types/user'
import type { EventResponse } from './events.service'
import * as eventsService from './events.service'
import { adminRepository } from '../repositories/admin.repository'

export interface PublicProfile {
  user: PublicUser
  isAdmin: boolean
  createdEvents: EventResponse[]
}

export async function getPublicProfile(userId: string): Promise<PublicProfile> {
  const user = await usersRepository.getPublicUserById(userId)
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено')
  }

  const [isAdmin, events] = await Promise.all([
    adminRepository.isAdmin(userId),
    eventsService.listEventsForUser(userId),
  ])

  return { user, isAdmin, createdEvents: events.created }
}

export async function updateDormitory(userId: string, dormitoryId: string): Promise<AuthUser> {
  // Явна перевірка існування замість покладання на FK-помилку з Postgres
  // — так користувач отримує зрозумілу 400-помилку, а не сиру 500.
  const exists = await dormitoriesRepository.exists(dormitoryId)
  if (!exists) {
    throw new AppError(400, 'DORMITORY_NOT_FOUND', 'Такого гуртожитку не існує')
  }

  return usersRepository.setDormitory(userId, dormitoryId)
}

export async function updateNotifyNewEvents(userId: string, notify: boolean): Promise<AuthUser> {
  return usersRepository.setNotifyNewEvents(userId, notify)
}
