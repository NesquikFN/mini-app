import type { CreateEventInput, DormEvent } from '../types/event'
import { currentUser, initialEvents } from './mockData'

const LATENCY_MS = 400

let store: DormEvent[] = initialEvents.map((event) => ({
  ...event,
  participantIds: [...event.participantIds],
}))
let nextId = store.length + 1

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), LATENCY_MS)
  })
}

function cloneEvent(event: DormEvent): DormEvent {
  return { ...event, participantIds: [...event.participantIds] }
}

export async function fetchEvents(): Promise<DormEvent[]> {
  return delay(store.map(cloneEvent))
}

export async function createEventRequest(
  input: CreateEventInput,
): Promise<DormEvent> {
  const event: DormEvent = {
    id: `event-${nextId++}`,
    emoji: '🗓️',
    title: input.title,
    description: input.description,
    date: input.date,
    time: input.time,
    location: input.location,
    maxParticipants: input.maxParticipants,
    creatorId: currentUser.id,
    participantIds: [currentUser.id],
  }
  store = [...store, event]
  return delay(cloneEvent(event))
}

export async function joinEventRequest(eventId: string): Promise<DormEvent> {
  const event = store.find((item) => item.id === eventId)
  if (!event) {
    throw new Error('Подію не знайдено')
  }
  if (event.participantIds.includes(currentUser.id)) {
    return delay(cloneEvent(event))
  }
  if (event.participantIds.length >= event.maxParticipants) {
    throw new Error('Місць більше немає')
  }
  event.participantIds = [...event.participantIds, currentUser.id]
  return delay(cloneEvent(event))
}

export async function leaveEventRequest(eventId: string): Promise<DormEvent> {
  const event = store.find((item) => item.id === eventId)
  if (!event) {
    throw new Error('Подію не знайдено')
  }
  event.participantIds = event.participantIds.filter(
    (id) => id !== currentUser.id,
  )
  return delay(cloneEvent(event))
}
