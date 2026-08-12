import type { PublicUser, RegistrationStatus } from './user'
import type { DormEvent } from './event'

export interface AdminStats {
  users: number
  registeredUsers: number
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

export type NotificationKind =
  | 'group_announcement'
  | 'personal_announcement'
  | 'event_reminder'
  | 'join_confirmation'
  | 'start_greeting'
  | 'notifications_off_confirmation'
  | 'registration_approved'
  | 'quick_plan_join'
  | 'waitlist_promoted'
  | 'poll_broadcast'

export interface NotificationLogEntry {
  id: string
  chatId: string
  recipientName?: string
  kind: NotificationKind
  eventId?: string
  eventTitle?: string
  pollId?: string
  pollQuestion?: string
  success: boolean
  errorMessage?: string
  createdAt: string
}

export interface NotificationLogResponse {
  entries: NotificationLogEntry[]
  pagination: Pagination
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

export interface HostListItem extends AdminUserView {
  hostSince: string
}

export interface VipListItem extends AdminUserView {
  vipSince: string
}

export interface GpuListItem extends AdminUserView {
  gpuSince: string
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

export interface RegistrationListItem {
  id: string
  telegramId: number
  firstName: string
  lastName?: string
  username?: string
  photoUrl?: string
  age?: number
  faculty?: string
  registrationStatus: RegistrationStatus
  registrationSubmittedAt?: string
}

export interface RegistrationDetail extends RegistrationListItem {
  instagram?: string
  bio?: string
  registrationReviewedAt?: string
  registrationReviewedBy?: string
  registrationRejectionReason?: string
}

export interface RegistrationsResponse {
  registrations: RegistrationListItem[]
  pagination: Pagination
}

export interface EventTemplate {
  id: string
  title: string
  description: string
  location: string
  isOnline: boolean
  groupUrl?: string
  gameUrl?: string
  gameUrlRequired: boolean
  imageUrl?: string
  dormitoryId?: string
  createdAt: string
  updatedAt: string
}

export interface EventTemplateInput {
  title: string
  description: string
  location: string
  isOnline: boolean
  groupUrl?: string
  gameUrl?: string
  gameUrlRequired: boolean
  imageFile?: File
  dormitoryId?: string
}
