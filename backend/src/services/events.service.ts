import { eventsRepository } from '../repositories/events.repository'
import { AppError } from '../utils/AppError'
import type { Event } from '../types/event'
import type { CreateEventInput } from '../validation/event.schemas'

export interface EventResponse {
  id: string
  creatorId: string
  title: string
  description: string
  date: string
  time: string
  location: string
  maxParticipants: number
  participants: string[]
  createdAt: string
}

export interface UserEvents {
  created: EventResponse[]
  participating: EventResponse[]
}

function toEventResponse(event: Event): EventResponse {
  return {
    id: event.id,
    creatorId: event.creatorId,
    title: event.title,
    description: event.description,
    date: event.date,
    time: event.time,
    location: event.location,
    maxParticipants: event.maxParticipants,
    participants: event.participantIds,
    createdAt: event.createdAt,
  }
}

function getEventOrThrow(id: string): Event {
  const event = eventsRepository.findById(id)
  if (!event) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
  return event
}

export function listEvents(): EventResponse[] {
  return eventsRepository.findAll().map(toEventResponse)
}

export function getEvent(id: string): EventResponse {
  return toEventResponse(getEventOrThrow(id))
}

export function createEvent(creatorId: string, input: CreateEventInput): EventResponse {
  const event = eventsRepository.insert({
    creatorId,
    title: input.title,
    description: input.description,
    date: input.date,
    time: input.time,
    location: input.location,
    maxParticipants: input.maxParticipants,
    participantIds: [creatorId],
    createdAt: new Date().toISOString(),
  })
  return toEventResponse(event)
}

export function joinEvent(eventId: string, userId: string): EventResponse {
  const event = getEventOrThrow(eventId)

  if (event.participantIds.includes(userId)) {
    throw new AppError(409, 'ALREADY_JOINED', 'Ви вже берете участь у цій події')
  }

  if (event.participantIds.length >= event.maxParticipants) {
    throw new AppError(409, 'EVENT_FULL', 'Місць більше немає')
  }

  event.participantIds.push(userId)
  return toEventResponse(event)
}

export function leaveEvent(eventId: string, userId: string): EventResponse {
  const event = getEventOrThrow(eventId)

  if (!event.participantIds.includes(userId)) {
    throw new AppError(409, 'NOT_PARTICIPATING', 'Ви не берете участі у цій події')
  }

  event.participantIds = event.participantIds.filter((id) => id !== userId)
  return toEventResponse(event)
}

export function listEventsForUser(userId: string): UserEvents {
  const all = eventsRepository.findAll()
  return {
    created: all.filter((event) => event.creatorId === userId).map(toEventResponse),
    participating: all
      .filter((event) => event.participantIds.includes(userId))
      .map(toEventResponse),
  }
}
