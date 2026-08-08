import type { CreateEventInput, DormEvent } from '../types/event'
import type { AuthUser, PublicUser } from '../types/user'
import type { Dormitory } from '../types/dormitory'
import type { EventsScope } from '../context/EventsContext'
import type {
  AdminStats,
  AdminUsersResponse,
  AdminUserDetail,
  AdminEventsResponse,
  AdminEventDetail,
  AdminEventDateFilter,
  AdminListItem,
  AdminUserView,
  EventTemplate,
  EventTemplateInput,
} from '../types/admin'
import { getSessionToken } from './session'

const API_URL = import.meta.env.VITE_API_URL

export class NetworkError extends Error {
  constructor(message = 'Не вдалося підключитися до сервера.') {
    super(message)
    this.name = 'NetworkError'
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** Показуємо користувачу лише повідомлення з наших власних типів помилок
 * (вони завжди українською і безпечні для показу) — будь-яку іншу
 * технічну помилку ховаємо за спільним запасним текстом. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof NetworkError || error instanceof ApiError) {
    return error.message
  }
  return 'Щось пішло не так. Спробуйте ще раз.'
}

interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false
  const errorField = (value as Record<string, unknown>).error
  if (typeof errorField !== 'object' || errorField === null) return false
  const { code, message } = errorField as Record<string, unknown>
  return typeof code === 'string' && typeof message === 'string'
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response

  const token = getSessionToken()

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new NetworkError()
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    if (isApiErrorBody(body)) {
      throw new ApiError(response.status, body.error.code, body.error.message)
    }
    throw new ApiError(
      response.status,
      'UNKNOWN_ERROR',
      'Сталася невідома помилка сервера.',
    )
  }

  return (await response.json()) as T
}

interface EventsListResponse {
  events: DormEvent[]
}

interface EventResponseBody {
  event: DormEvent
}

interface MeResponse {
  user: AuthUser
}

export interface TelegramChatOption {
  id: string
  title: string
  type: 'group' | 'supergroup' | 'channel'
}

export async function fetchAdminNotificationChats(): Promise<TelegramChatOption[]> {
  const data = await request<{ chats: TelegramChatOption[] }>('/admin/notification-chats')
  return data.chats
}

export interface TelegramTopicOption {
  id: string
  title: string
}

/** Порожній список означає, що в чаті не увімкнені гілки (Topics). */
export async function fetchAdminNotificationTopics(chatId: string): Promise<TelegramTopicOption[]> {
  const data = await request<{ topics: TelegramTopicOption[] }>(
    `/admin/notification-topics?chatId=${encodeURIComponent(chatId)}`,
  )
  return data.topics
}

export interface NotificationSettings {
  chatId?: string
  chatTitle?: string
  threadId?: string
  threadTitle?: string
}

export function fetchNotificationSettings(): Promise<NotificationSettings> {
  return request<NotificationSettings>('/admin/notification-settings')
}

export function updateNotificationSettings(
  chat?: TelegramChatOption,
  topic?: TelegramTopicOption,
): Promise<NotificationSettings> {
  return request<NotificationSettings>('/admin/notification-settings', {
    method: 'PUT',
    body: JSON.stringify({
      chatId: chat?.id ?? null,
      chatTitle: chat?.title ?? null,
      threadId: topic?.id ?? null,
      threadTitle: topic?.title ?? null,
    }),
  })
}

export interface MyEventsResponse {
  created: DormEvent[]
  participating: DormEvent[]
}

export async function fetchEvents(scope: EventsScope = 'mine'): Promise<DormEvent[]> {
  const data = await request<EventsListResponse>(`/events?scope=${scope}`)
  return data.events
}

export async function fetchEventById(id: string): Promise<DormEvent> {
  const data = await request<EventResponseBody>(`/events/${id}`)
  return data.event
}

export interface EventDetailResponse {
  event: DormEvent
  creator: PublicUser
  participants: PublicUser[]
}

/** Той самий GET /events/:id, але забирає ще й публічні профілі
 * організатора та учасників (backend додає ці поля до існуючої
 * відповіді, не змінюючи форму `event`). */
export async function fetchEventDetail(id: string): Promise<EventDetailResponse> {
  return request<EventDetailResponse>(`/events/${id}`)
}

export async function createEventRequest(
  input: CreateEventInput,
): Promise<DormEvent> {
  const { imageFile, ...payload } = input
  const data = await request<EventResponseBody>('/events', {
    method: 'POST',
    body: JSON.stringify({ ...payload, deferNotification: Boolean(imageFile) }),
  })
  if (!imageFile) return data.event

  const uploaded = await request<EventResponseBody>(`/events/${data.event.id}/image?announce=true`, {
    method: 'PUT',
    headers: { 'Content-Type': imageFile.type },
    body: imageFile,
  })
  return uploaded.event
}

export async function updateEventRequest(
  id: string,
  input: CreateEventInput,
): Promise<DormEvent> {
  const { imageFile, ...payload } = input
  const data = await request<EventResponseBody>(`/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!imageFile) return data.event

  const uploaded = await request<EventResponseBody>(`/events/${id}/image`, {
    method: 'PUT',
    headers: { 'Content-Type': imageFile.type },
    body: imageFile,
  })
  return uploaded.event
}

export async function deleteEventRequest(id: string): Promise<void> {
  await request<{ success: boolean }>(`/events/${id}`, { method: 'DELETE' })
}

export async function removeEventParticipantRequest(
  eventId: string,
  userId: string,
): Promise<DormEvent> {
  const data = await request<EventResponseBody>(`/events/${eventId}/participants/${userId}`, {
    method: 'DELETE',
  })
  return data.event
}

export async function joinEventRequest(eventId: string): Promise<DormEvent> {
  const data = await request<EventResponseBody>(`/events/${eventId}/join`, {
    method: 'POST',
  })
  return data.event
}

export async function leaveEventRequest(eventId: string): Promise<DormEvent> {
  const data = await request<EventResponseBody>(`/events/${eventId}/leave`, {
    method: 'DELETE',
  })
  return data.event
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const data = await request<MeResponse>('/me')
  return data.user
}

export interface PublicProfileResponse {
  user: PublicUser
  isAdmin: boolean
  createdEvents: DormEvent[]
}

export async function fetchPublicUser(id: string): Promise<PublicProfileResponse> {
  return request<PublicProfileResponse>(`/users/${id}`)
}

export async function updateMyDormitory(dormitoryId: string): Promise<AuthUser> {
  const data = await request<MeResponse>('/me', {
    method: 'PATCH',
    body: JSON.stringify({ dormitoryId }),
  })
  return data.user
}

export async function fetchDormitories(): Promise<Dormitory[]> {
  const data = await request<{ dormitories: Dormitory[] }>('/dormitories')
  return data.dormitories
}

export async function fetchMyEvents(): Promise<MyEventsResponse> {
  return request<MyEventsResponse>('/me/events')
}

export interface TelegramAuthResponse {
  user: AuthUser
  token: string
}

export async function authenticateWithTelegram(
  initData: string | undefined,
): Promise<TelegramAuthResponse> {
  return request<TelegramAuthResponse>('/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData }),
  })
}

// ---------------------------------------------------------------------
// Адмін-панель (/admin) — усі запити йдуть з тим самим Bearer-токеном,
// backend перевіряє requireTelegramAuth + requireAdmin на кожен з них.
// ---------------------------------------------------------------------

export async function fetchAdminCheck(): Promise<{ isAdmin: boolean }> {
  return request<{ isAdmin: boolean }>('/admin/check')
}

export async function fetchAdminStats(): Promise<AdminStats> {
  return request<AdminStats>('/admin/stats')
}

export async function fetchAdminUsers(
  page: number,
  limit: number,
  search?: string,
): Promise<AdminUsersResponse> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (search) params.set('search', search)
  return request<AdminUsersResponse>(`/admin/users?${params.toString()}`)
}

export async function fetchAdminUserDetail(id: string): Promise<AdminUserDetail> {
  return request<AdminUserDetail>(`/admin/users/${id}`)
}

export async function deleteAdminUser(id: string): Promise<void> {
  await request<{ success: boolean }>(`/admin/users/${id}`, { method: 'DELETE' })
}

export type BanDuration = 'week' | 'forever' | 'custom'

export async function banAdminUser(
  id: string,
  duration: BanDuration,
  until?: string,
): Promise<AdminUserView> {
  const data = await request<{ user: AdminUserView }>(`/admin/users/${id}/ban`, {
    method: 'PUT',
    body: JSON.stringify({ duration, ...(until ? { until } : {}) }),
  })
  return data.user
}

export async function unbanAdminUser(id: string): Promise<void> {
  await request<{ success: boolean }>(`/admin/users/${id}/ban`, { method: 'DELETE' })
}

export async function fetchBannedUsers(): Promise<AdminUserView[]> {
  const data = await request<{ users: AdminUserView[] }>('/admin/banned-users')
  return data.users
}

export async function fetchAdminEvents(
  page: number,
  limit: number,
  search: string | undefined,
  date: AdminEventDateFilter,
): Promise<AdminEventsResponse> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), date })
  if (search) params.set('search', search)
  return request<AdminEventsResponse>(`/admin/events?${params.toString()}`)
}

export async function fetchAdminEventDetail(id: string): Promise<AdminEventDetail> {
  return request<AdminEventDetail>(`/admin/events/${id}`)
}

export async function deleteAdminEvent(id: string): Promise<void> {
  await request<{ success: boolean }>(`/admin/events/${id}`, { method: 'DELETE' })
}

export async function removeAdminParticipant(eventId: string, userId: string): Promise<void> {
  await request<{ success: boolean }>(`/admin/events/${eventId}/participants/${userId}`, {
    method: 'DELETE',
  })
}

export async function fetchAdminAdmins(): Promise<AdminListItem[]> {
  const data = await request<{ admins: AdminListItem[] }>('/admin/admins')
  return data.admins
}

export async function addAdminByTelegramId(telegramId: number): Promise<AdminListItem> {
  const data = await request<{ admin: AdminListItem }>('/admin/admins', {
    method: 'POST',
    body: JSON.stringify({ telegramId }),
  })
  return data.admin
}

export async function removeAdmin(userId: string): Promise<void> {
  await request<{ success: boolean }>(`/admin/admins/${userId}`, { method: 'DELETE' })
}

export async function fetchEventTemplates(): Promise<EventTemplate[]> {
  const data = await request<{ templates: EventTemplate[] }>('/event-templates')
  return data.templates
}

export async function createEventTemplate(input: EventTemplateInput): Promise<EventTemplate> {
  const { imageFile, ...payload } = input
  const data = await request<{ template: EventTemplate }>('/event-templates', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return imageFile ? uploadEventTemplateImage(data.template.id, imageFile) : data.template
}

export async function updateEventTemplate(
  id: string,
  input: EventTemplateInput,
): Promise<EventTemplate> {
  const { imageFile, ...payload } = input
  const data = await request<{ template: EventTemplate }>(`/event-templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  return imageFile ? uploadEventTemplateImage(id, imageFile) : data.template
}

async function uploadEventTemplateImage(id: string, imageFile: File): Promise<EventTemplate> {
  const data = await request<{ template: EventTemplate }>(`/event-templates/${id}/image`, {
    method: 'PUT',
    headers: { 'Content-Type': imageFile.type },
    body: imageFile,
  })
  return data.template
}

export async function deleteEventTemplate(id: string): Promise<void> {
  await request<{ success: boolean }>(`/event-templates/${id}`, { method: 'DELETE' })
}

export async function createEventFromTemplate(id: string): Promise<DormEvent> {
  const data = await request<{ event: DormEvent }>(
    `/event-templates/${id}/create-event`,
    { method: 'POST' },
  )
  return data.event
}
