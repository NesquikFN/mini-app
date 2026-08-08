import { eventsRepository } from '../repositories/events.repository'
import { usersRepository } from '../repositories/users.repository'
import {
  eventTemplatesRepository,
  type EventTemplateInput,
} from '../repositories/event-templates.repository'
import { AppError } from '../utils/AppError'
import { addDaysToISODate, kyivNow } from '../utils/kyivTime'
import type { Event } from '../types/event'
import type { PublicUser } from '../types/user'
import type { EventTemplate } from '../types/admin'
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
  /** Повний список id — незмінна форма, на яку вже покладається frontend
   * (isFull-перевірка тощо). Не видаляти й не міняти тип. */
  participants: string[]
  /** === participants.length, тут лише щоб клієнту не рахувати самому. */
  participantCount: number
  /** Перші (за часом приєднання) щонайбільше 3 учасники з публічними
   * профілями — для avatar-стека на картці події. Завжди заповнений (не
   * lazy): усі функції нижче, що повертають EventResponse, проганяють
   * результат через attachParticipantPreview(s) одним batch-запитом. */
  participantPreview: PublicUser[]
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
    participantCount: event.participantIds.length,
    participantPreview: [],
    createdAt: event.createdAt,
    dormitoryId: event.dormitoryId,
  }
}

/**
 * Fills in `participantPreview` for a batch of events with exactly one
 * extra SQL query (events.repository.findParticipantPreviews), no matter
 * how many events are passed — the batch query every EventResponse-
 * returning function below funnels through, so the API never does N+1
 * (one query per event) to build avatar previews.
 */
async function attachParticipantPreviews(events: EventResponse[]): Promise<EventResponse[]> {
  if (events.length === 0) return events
  const previews = await eventsRepository.findParticipantPreviews(events.map((event) => event.id))
  return events.map((event) => ({ ...event, participantPreview: previews.get(event.id) ?? [] }))
}

async function attachParticipantPreview(event: EventResponse): Promise<EventResponse> {
  const [withPreview] = await attachParticipantPreviews([event])
  return withPreview
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
    return attachParticipantPreviews(events.map(toEventResponse))
  }

  const events = await eventsRepository.findAll()
  return attachParticipantPreviews(events.map(toEventResponse))
}

export async function getEvent(id: string): Promise<EventResponse> {
  return attachParticipantPreview(toEventResponse(await getEventOrThrow(id)))
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
  // Творець щойно автоприєднався (repository.insert), тож preview тут
  // ніколи не буде порожнім — саме цього й очікує EventCard одразу
  // після створення, без окремого рефетчу.
  const response = await attachParticipantPreview(toEventResponse(event))
  if (!input.deferNotification) await announceEvent(response)
  return response
}

export async function announceEvent(event: EventResponse): Promise<void> {
  const creator = await usersRepository.getPublicUserById(event.creatorId)
  const creatorInfo = creator ? { firstName: creator.firstName, username: creator.username } : undefined

  try {
    const settings = await settingsRepository.getNotificationSettings()
    if (settings.chatId) {
      await sendEventAnnouncement(settings.chatId, event, creatorInfo, settings.threadId)
    }
  } catch (error) {
    console.error('Не вдалося надіслати Telegram-анонс події:', error)
  }

  // Онлайн-подія доступна всім гуртожиткам — сповіщаємо всіх підписників.
  // Офлайн-подія лишається в межах свого гуртожитку — так само й тут.
  const subscriberIds = await usersRepository.getSubscribedTelegramIds(
    event.isOnline ? undefined : event.dormitoryId,
  )
  await Promise.all(
    subscriberIds.map(async (telegramId) => {
      try {
        await sendEventAnnouncement(String(telegramId), event, creatorInfo, undefined, true)
      } catch (error) {
        console.error(`Не вдалося надіслати особисте сповіщення про подію користувачу ${telegramId}:`, error)
      }
    }),
  )
}

/** Лише адмін-панель — звичайний Mini App редагування подій не пропонує. */
export async function updateEvent(
  id: string,
  input: UpdateEventInput,
): Promise<EventResponse> {
  await getEventOrThrow(id)
  return attachParticipantPreview(toEventResponse(await eventsRepository.update(id, input)))
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
  return attachParticipantPreview(toEventResponse(await eventsRepository.update(id, input)))
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
  return attachParticipantPreview(toEventResponse(await getEventOrThrow(eventId)))
}

export async function joinEvent(eventId: string, userId: string): Promise<EventResponse> {
  // Перевірка ліміту місць і повторного приєднання відбувається
  // атомарно всередині PostgreSQL-функції join_event (repository),
  // тому тут немає окремого "прочитати → перевірити → вставити".
  await eventsRepository.addParticipant(eventId, userId)
  // participantPreview у відповіді дозволяє EventsProvider оновити
  // avatar-стек на картці, підмінивши лише цю подію в списку — без
  // повторного GET /api/events для всіх подій одразу.
  return attachParticipantPreview(toEventResponse(await getEventOrThrow(eventId)))
}

export async function leaveEvent(eventId: string, userId: string): Promise<EventResponse> {
  await getEventOrThrow(eventId)

  const removed = await eventsRepository.removeParticipant(eventId, userId)
  if (!removed) {
    throw new AppError(409, 'NOT_PARTICIPATING', 'Ви не берете участі у цій події')
  }

  return attachParticipantPreview(toEventResponse(await getEventOrThrow(eventId)))
}

/** Один batch-запит прев'ю на ОБИДВА списки разом (а не по одному на
 * кожен) — id подій об'єднуються перед єдиним викликом repository. */
export async function listEventsForUser(userId: string): Promise<UserEvents> {
  const [created, participating] = await Promise.all([
    eventsRepository.getUserCreatedEvents(userId),
    eventsRepository.getUserParticipatingEvents(userId),
  ])

  const createdResponses = created.map(toEventResponse)
  const participatingResponses = participating.map(toEventResponse)
  const previews = await eventsRepository.findParticipantPreviews([
    ...new Set([...createdResponses, ...participatingResponses].map((event) => event.id)),
  ])
  const withPreview = (event: EventResponse): EventResponse => ({
    ...event,
    participantPreview: previews.get(event.id) ?? [],
  })

  return {
    created: createdResponses.map(withPreview),
    participating: participatingResponses.map(withPreview),
  }
}

/**
 * Шаблони ігор — спільна вкладка "Ігри", доступна будь-якому
 * автентифікованому юзеру (не лише адмінам): читати, створювати,
 * редагувати, видаляти й запускати може кожен. Без обмеження гуртожитком
 * на запуск — той самий рівень доступу, що раніше мали лише адміни.
 */
export async function listEventTemplates(): Promise<EventTemplate[]> {
  return eventTemplatesRepository.findAll()
}

export async function createEventTemplate(input: EventTemplateInput): Promise<EventTemplate> {
  return eventTemplatesRepository.insert(input)
}

export async function updateEventTemplate(id: string, input: EventTemplateInput): Promise<EventTemplate> {
  const template = await eventTemplatesRepository.update(id, input)
  if (!template) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Шаблон не знайдено')
  return template
}

export async function updateEventTemplateImage(id: string, imageUrl: string): Promise<EventTemplate> {
  const template = await eventTemplatesRepository.updateImage(id, imageUrl)
  if (!template) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Шаблон не знайдено')
  return template
}

export async function deleteEventTemplate(id: string): Promise<void> {
  const removed = await eventTemplatesRepository.remove(id)
  if (!removed) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Шаблон не знайдено')
}

function nextTemplateDate(weekday: number, time: string): string {
  const now = kyivNow()
  let daysAhead = (weekday - now.weekday + 7) % 7
  if (daysAhead === 0 && time <= now.time) daysAhead = 7
  return addDaysToISODate(now.date, daysAhead)
}

export async function createEventFromTemplate(
  templateId: string,
  creatorId: string,
  creatorDormitoryId?: string,
  /** Той, хто натискає "Створити", обирає час гри сам — шаблон дає лише
   * день тижня та підказку-за-замовчуванням для пікера. */
  overrideTime?: string,
): Promise<EventResponse> {
  const template = await eventTemplatesRepository.findById(templateId)
  if (!template) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Шаблон не знайдено')

  const time = overrideTime ?? template.time.slice(0, 5)

  try {
    const event = await createEvent(
      creatorId,
      template.dormitoryId ?? creatorDormitoryId,
      {
        title: template.title,
        description: template.description,
        date: nextTemplateDate(template.weekday, time),
        time,
        location: template.isOnline ? 'Онлайн' : template.location,
        isOnline: template.isOnline,
        maxParticipants: template.maxParticipants,
        groupUrl: template.groupUrl,
        deferNotification: Boolean(template.imageUrl),
      },
      template.id,
    )
    if (!template.imageUrl) return event

    const eventWithImage = await updateEvent(event.id, { imageUrl: template.imageUrl })
    await announceEvent(eventWithImage)
    return eventWithImage
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    ) {
      throw new AppError(409, 'EVENT_ALREADY_CREATED', 'Найближчу подію з цього шаблону вже створено')
    }
    throw error
  }
}
