import type { DormEvent, EventInput, UpdateEventInput } from '../types/event'
import type { AdminUserView, AuthUser } from '../types/user'
import type { AdminStats } from '../types/stats'
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

/** Показуємо лише повідомлення з наших власних типів помилок (завжди
 * українською і безпечні для показу) — решту ховаємо за спільним текстом. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof NetworkError || error instanceof ApiError) {
    return error.message
  }
  return 'Щось пішло не так. Спробуйте ще раз.'
}

interface ApiErrorBody {
  error: { code: string; message: string }
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
    throw new ApiError(response.status, 'UNKNOWN_ERROR', 'Сталася невідома помилка сервера.')
  }

  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export interface TelegramAuthResponse {
  user: AuthUser
  token: string
}

/** Той самий ендпоінт, що й у звичайному Mini App — адмінська
 * автентифікація не дублює Telegram-логіку, лише додає перевірку
 * admin_users на бекенді (requireAdmin) поверх звичайної сесії. */
export async function authenticateWithTelegram(
  initData: string | undefined,
): Promise<TelegramAuthResponse> {
  return request<TelegramAuthResponse>('/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData }),
  })
}

export async function fetchStats(): Promise<AdminStats> {
  return request<AdminStats>('/admin/stats')
}

export async function fetchUsers(): Promise<AdminUserView[]> {
  const data = await request<{ users: AdminUserView[] }>('/admin/users')
  return data.users
}

export async function fetchEvents(): Promise<DormEvent[]> {
  const data = await request<{ events: DormEvent[] }>('/admin/events')
  return data.events
}

export interface EventDetail {
  event: DormEvent
  participants: AdminUserView[]
}

export async function fetchEventDetail(id: string): Promise<EventDetail> {
  return request<EventDetail>(`/admin/events/${id}`)
}

export async function createEvent(input: EventInput): Promise<DormEvent> {
  const data = await request<{ event: DormEvent }>('/admin/events', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return data.event
}

export async function updateEvent(id: string, input: UpdateEventInput): Promise<DormEvent> {
  const data = await request<{ event: DormEvent }>(`/admin/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return data.event
}

export async function deleteEvent(id: string): Promise<void> {
  await request<void>(`/admin/events/${id}`, { method: 'DELETE' })
}

export async function removeParticipant(eventId: string, userId: string): Promise<DormEvent> {
  const data = await request<{ event: DormEvent }>(
    `/admin/events/${eventId}/participants/${userId}`,
    { method: 'DELETE' },
  )
  return data.event
}
