import type { CreateEventInput, DormEvent } from '../types/event'
import type { AuthUser } from '../types/user'

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

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
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

export interface MyEventsResponse {
  created: DormEvent[]
  participating: DormEvent[]
}

export async function fetchEvents(): Promise<DormEvent[]> {
  const data = await request<EventsListResponse>('/events')
  return data.events
}

export async function fetchEventById(id: string): Promise<DormEvent> {
  const data = await request<EventResponseBody>(`/events/${id}`)
  return data.event
}

export async function createEventRequest(
  input: CreateEventInput,
): Promise<DormEvent> {
  const data = await request<EventResponseBody>('/events', {
    method: 'POST',
    body: JSON.stringify(input),
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

export async function fetchMyEvents(): Promise<MyEventsResponse> {
  return request<MyEventsResponse>('/me/events')
}
