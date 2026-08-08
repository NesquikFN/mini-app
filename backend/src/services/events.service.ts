import { eventsRepository } from '../repositories/events.repository'
import { usersRepository } from '../repositories/users.repository'
import { AppError } from '../utils/AppError'
import type { Event } from '../types/event'
import type { PublicUser } from '../types/user'
import type { CreateEventInput, UpdateEventInput } from '../validation/event.schemas'
import { settingsRepository } from '../repositories/settings.repository'
import { sendEventAnnouncement } from './telegram-notifications.service'

export interface EventResponse {
  id: string
  creatorId: string
  title: string
  description: string
  imageUrl?: string
  groupUrl?: string
  isOnline: boolean
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
    imageUrl: event.imageUrl,
    groupUrl: event.groupUrl,
    isOnline: event.isOnline,
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
  sourceTemplateId?: string,
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
    groupUrl: input.groupUrl,
    isOnline: input.isOnline,
    date: input.date,
    time: input.time,
    location: input.location,
    maxParticipants: input.maxParticipants,
    dormitoryId: creatorDormitoryId,
    sourceTemplateId,
  })
  const response = toEventResponse(event)
  if (!input.deferNotification) await announceEvent(response)
  return response
}

export async function announceEvent(event: EventResponse): Promise<void> {
  try {
    const settings = await settingsRepository.getNotificationSettings()
    if (!settings.chatId) return
    const creator = await usersRepository.getPublicUserById(event.creatorId)
    await sendEventAnnouncement(
      settings.chatId,
      event,
      creator ? { firstName: creator.firstName, username: creator.username } : undefined,
      settings.threadId,
    )
  } catch (error) {
    console.error('Не вдалося надіслати Telegram-анонс події:', error)
  }
}

/** Лише адмін-панель — звичайний Mini App редагування подій не пропонує. */
export async function updateEvent(
  id: string,
  input: UpdateEventInput,
): Promise<EventResponse> {
  await getEventOrThrow(id)
  return toEventResponse(await eventsRepository.update(id, input))
}

export async function updateOwnEvent(
  id: string,
  creatorId: string,
  input: UpdateEventInput,
): Promise<EventResponse> {
  const event = await getEventOrThrow(id)
  if (event.creatorId !== creatorId) {
    throw new AppError(403, 'EVENT_OWNER_REQUIRED', 'Редагувати подію може лише її автор')
  }
  if (
    input.maxParticipants !== undefined &&
    input.maxParticipants < event.participantIds.length
  ) {
    throw new AppError(
      400,
      'MAX_PARTICIPANTS_TOO_SMALL',
      'Ліміт не може бути меншим за поточну кількість учасників',
    )
  }
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

export async function deleteOwnEvent(id: string, creatorId: string): Promise<void> {
  const event = await getEventOrThrow(id)
  if (event.creatorId !== creatorId) {
    throw new AppError(403, 'EVENT_OWNER_REQUIRED', 'Видалити подію може лише її автор')
  }
  await deleteEvent(id)
}

export async function removeOwnEventParticipant(
  eventId: string,
  creatorId: string,
  participantId: string,
): Promise<EventResponse> {
  const event = await getEventOrThrow(eventId)
  if (event.creatorId !== creatorId) {
    throw new AppError(403, 'EVENT_OWNER_REQUIRED', 'Видаляти учасників може лише автор події')
  }
  if (participantId === creatorId) {
    throw new AppError(400, 'CANNOT_REMOVE_ORGANIZER', 'Організатора не можна видалити з події')
  }
  const removed = await eventsRepository.removeParticipant(eventId, participantId)
  if (!removed) {
    throw new AppError(404, 'PARTICIPANT_NOT_FOUND', 'Учасника не знайдено')
  }
  return toEventResponse(await getEventOrThrow(eventId))
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
