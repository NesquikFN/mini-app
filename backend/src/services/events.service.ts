import { eventsRepository } from '../repositories/events.repository'
import { usersRepository } from '../repositories/users.repository'
import { AppError } from '../utils/AppError'
import type { Event } from '../types/event'
import type { PublicUser } from '../types/user'
import type { CreateEventInput, UpdateEventInput } from '../validation/event.schemas'

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
  dormitoryId: string
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
    dormitoryId: event.dormitoryId,
  }
}

async function getEventOrThrow(id: string): Promise<Event> {
  const event = await eventsRepository.findById(id)
  if (!event) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
  return event
}

export type EventsScope = 'mine' | 'all'

/**
 * scope='mine' — сервер сам вирішує, що таке "мій гуртожиток", виключно
 * з `userDormitoryId` (req.user.dormitoryId із сесії). Клієнт не може
 * передати довільний dormitoryId для фільтрації чужого гуртожитку —
 * єдиний вибір, який залишається frontend, це scope='all' (побачити
 * геть усі події) або 'mine' (свої, за замовчуванням).
 */
export async function listEvents(
  scope: EventsScope,
  userDormitoryId: string | undefined,
): Promise<EventResponse[]> {
  if (scope === 'mine') {
    if (!userDormitoryId) return []
    const events = await eventsRepository.findAll(userDormitoryId)
    return events.map(toEventResponse)
  }

  const events = await eventsRepository.findAll()
  return events.map(toEventResponse)
}

export async function getEvent(id: string): Promise<EventResponse> {
  return toEventResponse(await getEventOrThrow(id))
}

export interface EventMembers {
  creator: PublicUser
  participants: PublicUser[]
}

/** Публічні профілі організатора й учасників для сторінки деталей події
 * (звичайний Mini App — не адмінка, тому лише PublicUser, без telegram_id
 * чи дати реєстрації). Один запит на всіх задіяних users одразу: творець
 * не завжди входить до participants (може вийти зі своєї ж події), тож
 * об'єднуємо id перед запитом, а не припускаємо підмножину. */
export async function getEventMembers(event: EventResponse): Promise<EventMembers> {
  const ids = Array.from(new Set([event.creatorId, ...event.participants]))
  const users = await usersRepository.getPublicUsersByIds(ids)
  const byId = new Map(users.map((user) => [user.id, user]))
  const resolve = (id: string): PublicUser =>
    byId.get(id) ?? { id, firstName: 'Учасник DormHub' }

  return {
    creator: resolve(event.creatorId),
    participants: event.participants.map(resolve),
  }
}

/**
 * `creatorDormitoryId` — гуртожиток творця, зчитаний з req.user (тобто з
 * users.dormitory_id через сесію), а не з тіла запиту. `input` навмисно
 * типізований як CreateEventInput, чия Zod-схема не має поля dormitoryId
 * взагалі — навіть якщо клієнт надішле його в тілі, воно відкидається
 * ще на validation-шарі й сюди просто не долітає. Немає способу для
 * frontend підмінити гуртожиток створюваної події.
 */
export async function createEvent(
  creatorId: string,
  creatorDormitoryId: string | undefined,
  input: CreateEventInput,
): Promise<EventResponse> {
  if (creatorDormitoryId === undefined) {
    throw new AppError(
      400,
      'DORMITORY_REQUIRED',
      'Спочатку оберіть гуртожиток у профілі',
    )
  }

  const event = await eventsRepository.insert({
    creatorId,
    title: input.title,
    description: input.description,
    date: input.date,
    time: input.time,
    location: input.location,
    maxParticipants: input.maxParticipants,
    dormitoryId: creatorDormitoryId,
  })
  return toEventResponse(event)
}

/** Лише адмін-панель — звичайний Mini App редагування подій не пропонує. */
export async function updateEvent(
  id: string,
  input: UpdateEventInput,
): Promise<EventResponse> {
  await getEventOrThrow(id)
  return toEventResponse(await eventsRepository.update(id, input))
}

/** Лише адмін-панель. event_participants видаляються каскадом (FK ON
 * DELETE CASCADE, див. database/schema.sql) — окремого запиту не треба. */
export async function deleteEvent(id: string): Promise<void> {
  const removed = await eventsRepository.remove(id)
  if (!removed) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
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
