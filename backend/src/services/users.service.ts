import { usersRepository } from '../repositories/users.repository'
import { dormitoriesRepository } from '../repositories/dormitories.repository'
import { AppError } from '../utils/AppError'
import type { AuthUser, PublicUser } from '../types/user'
import type { UserProfileUpdate } from '../repositories/users.repository'
import type { EventResponse } from './events.service'
import * as eventsService from './events.service'
import { adminRepository } from '../repositories/admin.repository'
import { hostsRepository } from '../repositories/hosts.repository'
import { vipsRepository } from '../repositories/vips.repository'
import { gpusRepository } from '../repositories/gpus.repository'

export interface PublicProfile {
  user: PublicUser
  isAdmin: boolean
  isHost: boolean
  isVip: boolean
  isGpu: boolean
  createdEvents: EventResponse[]
}

export async function getPublicProfile(userId: string, viewerId: string): Promise<PublicProfile> {
  const user = await usersRepository.getPublicUserById(userId)
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено')
  }

  const [isAdmin, isHost, targetIsVip, viewerIsVip, targetIsGpu, viewerIsGpu, events] = await Promise.all([
    adminRepository.isAdmin(userId),
    hostsRepository.isHost(userId),
    vipsRepository.isVip(userId),
    vipsRepository.isVip(viewerId),
    gpusRepository.isGpu(userId),
    gpusRepository.isGpu(viewerId),
    eventsService.listEventsForUser(userId, viewerId),
  ])

  return {
    user,
    isAdmin,
    isHost,
    isVip: viewerIsVip && targetIsVip,
    isGpu: viewerIsGpu && targetIsGpu,
    createdEvents: events.created,
  }
}

export async function withRoles(user: AuthUser): Promise<AuthUser> {
  const [isAdmin, isHost, isVip, isGpu] = await Promise.all([
    adminRepository.isAdmin(user.id),
    hostsRepository.isHost(user.id),
    vipsRepository.isVip(user.id),
    gpusRepository.isGpu(user.id),
  ])
  return { ...user, isAdmin, isHost, isVip, isGpu }
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

export async function updateProfile(
  userId: string,
  input: UserProfileUpdate,
): Promise<AuthUser> {
  return usersRepository.updateProfile(userId, input)
}
