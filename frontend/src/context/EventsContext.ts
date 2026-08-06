import { createContext } from 'react'
import type { CreateEventInput, DormEvent } from '../types/event'

export type EventsStatus = 'loading' | 'success' | 'error'

export interface EventsContextValue {
  events: DormEvent[]
  status: EventsStatus
  errorMessage: string | null
  pendingEventId: string | null
  reload: () => void
  createEvent: (input: CreateEventInput) => Promise<DormEvent>
  joinEvent: (eventId: string) => Promise<void>
  leaveEvent: (eventId: string) => Promise<void>
}

export const EventsContext = createContext<EventsContextValue | null>(null)
