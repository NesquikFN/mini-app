import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { EventsContext, type EventsStatus } from './EventsContext'
import type { CreateEventInput, DormEvent } from '../types/event'
import {
  createEventRequest,
  fetchEvents,
  joinEventRequest,
  leaveEventRequest,
} from '../services/mockApi'

export function EventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<DormEvent[]>([])
  const [status, setStatus] = useState<EventsStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingEventId, setPendingEventId] = useState<string | null>(null)

  const runFetch = useCallback(() => {
    fetchEvents()
      .then((data) => {
        setEvents(data)
        setStatus('success')
      })
      .catch(() => {
        setStatus('error')
        setErrorMessage('Не вдалося завантажити події.')
      })
  }, [])

  useEffect(() => {
    runFetch()
  }, [runFetch])

  const reload = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    runFetch()
  }, [runFetch])

  const createEvent = useCallback(async (input: CreateEventInput) => {
    const event = await createEventRequest(input)
    setEvents((prev) => [...prev, event])
    return event
  }, [])

  const joinEvent = useCallback(async (eventId: string) => {
    setPendingEventId(eventId)
    try {
      const updated = await joinEventRequest(eventId)
      setEvents((prev) =>
        prev.map((item) => (item.id === eventId ? updated : item)),
      )
    } finally {
      setPendingEventId(null)
    }
  }, [])

  const leaveEvent = useCallback(async (eventId: string) => {
    setPendingEventId(eventId)
    try {
      const updated = await leaveEventRequest(eventId)
      setEvents((prev) =>
        prev.map((item) => (item.id === eventId ? updated : item)),
      )
    } finally {
      setPendingEventId(null)
    }
  }, [])

  const value = useMemo(
    () => ({
      events,
      status,
      errorMessage,
      pendingEventId,
      reload,
      createEvent,
      joinEvent,
      leaveEvent,
    }),
    [
      events,
      status,
      errorMessage,
      pendingEventId,
      reload,
      createEvent,
      joinEvent,
      leaveEvent,
    ],
  )

  return (
    <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
  )
}
