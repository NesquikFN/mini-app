import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { EventsContext, type EventsScope, type EventsStatus } from './EventsContext'
import type { CreateEventInput, DormEvent } from '../types/event'
import {
  createEventRequest,
  deleteEventRequest,
  fetchEvents,
  getErrorMessage,
  joinEventRequest,
  joinEventWaitlistRequest,
  leaveEventRequest,
  leaveEventWaitlistRequest,
  removeEventParticipantRequest,
  updateEventRequest,
} from '../services/api'

export function EventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<DormEvent[]>([])
  const [status, setStatus] = useState<EventsStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingEventId, setPendingEventId] = useState<string | null>(null)
  const [scope, setScopeState] = useState<EventsScope>('mine')

  const runFetch = useCallback(() => {
    fetchEvents(scope)
      .then((data) => {
        setEvents(data)
        setStatus('success')
      })
      .catch((error: unknown) => {
        setStatus('error')
        setErrorMessage(getErrorMessage(error))
      })
  }, [scope])

  useEffect(() => {
    runFetch()
  }, [runFetch])

  const reload = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    runFetch()
  }, [runFetch])

  // Викликається лише з click-хендлерів (перемикач "Мій гуртожиток / Усі
  // гуртожитки" на EventsPage) — синхронний скидання статусу тут, а не в
  // ефекті, той самий патерн, що й reload(). Зміна scope міняє identity
  // runFetch (залежність [scope]), тож useEffect вище сам перезапустить
  // фактичний запит.
  const setScope = useCallback((next: EventsScope) => {
    setStatus('loading')
    setErrorMessage(null)
    setScopeState(next)
  }, [])

  const createEvent = useCallback(async (input: CreateEventInput) => {
    const event = await createEventRequest(input)
    setEvents((prev) => [...prev, event])
    return event
  }, [])

  const updateEvent = useCallback(async (eventId: string, input: CreateEventInput) => {
    const event = await updateEventRequest(eventId, input)
    setEvents((prev) => prev.map((item) => (item.id === eventId ? event : item)))
    return event
  }, [])

  const deleteEvent = useCallback(async (eventId: string) => {
    await deleteEventRequest(eventId)
    setEvents((prev) => prev.filter((item) => item.id !== eventId))
  }, [])

  const removeParticipant = useCallback(async (eventId: string, userId: string) => {
    const event = await removeEventParticipantRequest(eventId, userId)
    setEvents((prev) => prev.map((item) => (item.id === eventId ? event : item)))
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

  const joinWaitlist = useCallback(async (eventId: string) => {
    setPendingEventId(eventId)
    try {
      const updated = await joinEventWaitlistRequest(eventId)
      setEvents((prev) => prev.map((item) => (item.id === eventId ? updated : item)))
      return updated
    } finally {
      setPendingEventId(null)
    }
  }, [])

  const leaveWaitlist = useCallback(async (eventId: string) => {
    setPendingEventId(eventId)
    try {
      const updated = await leaveEventWaitlistRequest(eventId)
      setEvents((prev) => prev.map((item) => (item.id === eventId ? updated : item)))
      return updated
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
      scope,
      setScope,
      reload,
      createEvent,
      updateEvent,
      deleteEvent,
      removeParticipant,
      joinEvent,
      leaveEvent,
      joinWaitlist,
      leaveWaitlist,
    }),
    [
      events,
      status,
      errorMessage,
      pendingEventId,
      scope,
      setScope,
      reload,
      createEvent,
      updateEvent,
      deleteEvent,
      removeParticipant,
      joinEvent,
      leaveEvent,
      joinWaitlist,
      leaveWaitlist,
    ],
  )

  return (
    <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
  )
}
