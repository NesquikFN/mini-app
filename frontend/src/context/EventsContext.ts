import { createContext } from 'react'
import type { CreateEventInput, DormEvent } from '../types/event'

export type EventsStatus = 'loading' | 'success' | 'error'
export type EventsScope = 'mine' | 'all'

export interface EventsContextValue {
  events: DormEvent[]
  status: EventsStatus
  errorMessage: string | null
  pendingEventId: string | null
  /** 'mine' (за замовчуванням) — backend сам фільтрує за гуртожитком
   * поточного користувача; 'all' — усі гуртожитки. Перемикається через
   * setScope, а не клієнтським фільтром уже завантаженого списку. */
  scope: EventsScope
  setScope: (scope: EventsScope) => void
  reload: () => void
  createEvent: (input: CreateEventInput) => Promise<DormEvent>
  updateEvent: (eventId: string, input: CreateEventInput) => Promise<DormEvent>
  deleteEvent: (eventId: string) => Promise<void>
  removeParticipant: (eventId: string, userId: string) => Promise<void>
  joinEvent: (eventId: string) => Promise<void>
  leaveEvent: (eventId: string) => Promise<void>
  /** Стати в чергу. Якщо місце встигло звільнитись, backend замість
   * черги виконує звичайне приєднання — повернута подія вже містить
   * користувача серед учасників. */
  joinWaitlist: (eventId: string) => Promise<DormEvent>
  leaveWaitlist: (eventId: string) => Promise<DormEvent>
}

export const EventsContext = createContext<EventsContextValue | null>(null)
