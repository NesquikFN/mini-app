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

async function getEventOrThrow(id: string): Promise<Event> {
  const event = await eventsRepository.findById(id)
  if (!event) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
  return event
}

export async function listEvents(): Promise<EventResponse[]> {
  const events = await eventsRepository.findAll()
  return events.map(toEventResponse)
}

export async function getEvent(id: string): Promise<EventResponse> {
  return toEventResponse(await getEventOrThrow(id))
}

export async function createEvent(
  creatorId: string,
  input: CreateEventInput,
): Promise<EventResponse> {
  const event = await eventsRepository.insert({
    creatorId,
    title: input.title,
    description: input.description,
    date: input.date,
    time: input.time,
    location: input.location,
    maxParticipants: input.maxParticipants,
  })
  return toEventResponse(event)
}

export async function joinEvent(eventId: string, userId: string): Promise<EventResponse> {
  // Перевірка ліміту місць і повторного приєднання відбувається
  // атомарно всередині PostgreSQL-функції join_event (repository),
  // тому тут немає окремого "прочитати → перевірити → вставити".
  await eventsRepository.addParticipant(eventId, userId)
  return toEventResponse(await getEventOrThrow(eventId))
}

export async function leaveEvent(eventId: string, userId: string): Promise<EventResponse> {
  await getEventOrThrow(eventId)

  const removed = await eventsRepository.removeParticipant(eventId, userId)
  if (!removed) {
    throw new AppError(409, 'NOT_PARTICIPATING', 'Ви не берете участі у цій події')
  }

  return toEventResponse(await getEventOrThrow(eventId))
}

export async function listEventsForUser(userId: string): Promise<UserEvents> {
  const [created, participating] = await Promise.all([
    eventsRepository.getUserCreatedEvents(userId),
    eventsRepository.getUserParticipatingEvents(userId),
  ])

  return {
    created: created.map(toEventResponse),
    participating: participating.map(toEventResponse),
  }
}
