import type { AdminUserView, PublicUser } from './user'
import type { EventResponse } from '../services/events.service'

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

export interface AdminUserListItem extends AdminUserView {
  /** Кількість подій, які створив цей користувач — рахується батчем на
   * рівні сторінки списку (admin.repository.countEventsByCreatorIds),
   * а не окремим запитом на кожного користувача. */
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
  createdEvents: EventResponse[]
  participatingEvents: EventResponse[]
}

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
  event: EventResponse
  creator: PublicUser
  participants: PublicUser[]
}

export interface AdminListItem extends AdminUserView {
  /** admin_users.created_at — відколи цей users.id має права адміна. */
  adminSince: string
}
