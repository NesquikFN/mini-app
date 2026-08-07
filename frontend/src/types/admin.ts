import type { PublicUser } from './user'
import type { DormEvent } from './event'

export interface AdminStats {
  users: number
  events: number
  activeEvents: number
  participants: number
}

export interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

/** Ширший профіль для адмінки — на відміну від PublicUser включає
 * telegram_id і дату реєстрації, бо це вже адміністративний інтерфейс. */
export interface AdminUserView {
  id: string
  telegramId: number
  firstName: string
  lastName?: string
  username?: string
  photoUrl?: string
  dormitoryId?: string
  createdAt: string
}

export interface AdminListItem extends AdminUserView {
  adminSince: string
}

export interface AdminUserListItem extends AdminUserView {
  eventsCreatedCount: number
}

export interface AdminUsersResponse {
  users: AdminUserListItem[]
  pagination: Pagination
}

export interface AdminUserDetail {
  user: AdminUserView
  stats: {
    createdEvents: number
    participatingEvents: number
  }
  createdEvents: DormEvent[]
  participatingEvents: DormEvent[]
}

export type AdminEventDateFilter = 'today' | 'week' | 'all'

export interface AdminEventListItem {
  id: string
  title: string
  description: string
  date: string
  time: string
  location: string
  maxParticipants: number
  participantsCount: number
  creator: PublicUser
  createdAt: string
}

export interface AdminEventsResponse {
  events: AdminEventListItem[]
  pagination: Pagination
}

export interface AdminEventDetail {
  event: DormEvent
  creator: PublicUser
  participants: PublicUser[]
}
