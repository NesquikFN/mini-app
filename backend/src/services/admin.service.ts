import { adminRepository } from '../repositories/admin.repository'
import { usersRepository } from '../repositories/users.repository'
import * as eventsService from './events.service'
import type { EventResponse } from './events.service'
import type { AdminUserView } from '../types/user'
import { todayISODate } from '../utils/date'

export interface AdminStats {
  totalUsers: number
  totalEvents: number
  eventsToday: number
  totalParticipations: number
  activeUsers: number
}

export async function getStats(): Promise<AdminStats> {
  const [totalUsers, totalEvents, eventsToday, totalParticipations, activeUsers] =
    await Promise.all([
      adminRepository.countUsers(),
      adminRepository.countEvents(),
      adminRepository.countEventsOnDate(todayISODate()),
      adminRepository.countParticipations(),
      adminRepository.countActiveUsers(),
    ])

  return { totalUsers, totalEvents, eventsToday, totalParticipations, activeUsers }
}

export async function listUsers(): Promise<AdminUserView[]> {
  return usersRepository.getAllUsers()
}

export interface EventDetailResponse {
  event: EventResponse
  participants: AdminUserView[]
}

export async function getEventDetail(id: string): Promise<EventDetailResponse> {
  const event = await eventsService.getEvent(id)
  const participants = await usersRepository.getUsersByIds(event.participants)
  return { event, participants }
}

/** Адмін знімає довільного користувача з події — та сама доменна дія, що
 * й "вийти з події" від імені самого учасника, тому переюзаємо
 * eventsService.leaveEvent замість повторної реалізації. */
export async function removeParticipant(
  eventId: string,
  userId: string,
): Promise<EventResponse> {
  return eventsService.leaveEvent(eventId, userId)
}
