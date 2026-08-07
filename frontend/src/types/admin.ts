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
  bannedUntil?: string
  bannedPermanently: boolean
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

export interface EventTemplate {
  id: string
  title: string
  description: string
  weekday: number
  time: string
  location: string
  isOnline: boolean
  maxParticipants: number
  groupUrl?: string
  imageUrl?: string
  dormitoryId?: string
  createdAt: string
  updatedAt: string
}

export interface EventTemplateInput {
  title: string
  description: string
  weekday: number
  time: string
  location: string
  isOnline: boolean
  maxParticipants: number
  groupUrl?: string
  imageFile?: File
  dormitoryId?: string
}
