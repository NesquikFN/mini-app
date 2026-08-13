import { eventsRepository, EventNotFullError } from '../repositories/events.repository'
import { usersRepository } from '../repositories/users.repository'
import {
  eventTemplatesRepository,
  type EventTemplateInput,
} from '../repositories/event-templates.repository'
import { AppError } from '../utils/AppError'
import type { Event } from '../types/event'
import type { PublicUser } from '../types/user'
import type { EventTemplate } from '../types/admin'
import type {
  CreateEventInput,
  InternalEventPatch,
  UpdateEventInput,
} from '../validation/event.schemas'
import { assertEventEditable, assertEventInvariants } from './event-invariants'
import { isKyivDateTimeInPast } from '../utils/kyivTime'
import { settingsRepository } from '../repositories/settings.repository'
import {
  buildEventDeepLink,
  sendEventAnnouncement,
  sendEventJoinConfirmation,
  sendWaitlistPromotionMessage,
  NOTIFICATION_CONCURRENCY,
} from './telegram-notifications.service'
import { mapWithConcurrency } from '../utils/concurrency'
import { vipsRepository } from '../repositories/vips.repository'
import { gpusRepository } from '../repositories/gpus.repository'
import { NO_DORMITORY_ID } from '../types/dormitory'
import { getReliableOrganizerFlags } from './organizer-reputation.service'

export interface EventResponse {
  id: string
  creatorId: string
  title: string
  description: string
  imageUrl?: string
  groupUrl?: string
  gameUrl?: string
  isOnline: boolean
  vipOnly: boolean
  gpuOnly: boolean
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
  /** Скільки людей чекає в черзі. Видно всім — на відміну від самого
   * списку черги, який отримують лише організатор і адмін. */
  waitlistCount: number
  /** Позиція саме цього глядача в черзі (1-based), якщо він у ній. */
  viewerWaitlistPosition?: number
  /** Автоматичний бейдж «Надійний організатор» творця цієї події —
   * рахується на льоту (organizer-reputation.service.ts), ніде не
   * зберігається. Завжди заповнений тим самим batch-проходом, що й
   * participantPreview/waitlistCount, щоб EventCard не робив N+1. */
  creatorReliable: boolean
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
    gameUrl: event.gameUrl,
    isOnline: event.isOnline,
    vipOnly: event.vipOnly,
    gpuOnly: event.gpuOnly,
    date: event.date,
    time: event.time,
    location: event.location,
    maxParticipants: event.maxParticipants,
    participants: event.participantIds,
    participantCount: event.participantIds.length,
    participantPreview: [],
    createdAt: event.createdAt,
    dormitoryId: event.dormitoryId,
    // Реальні значення домальовує attachParticipantPreviews разом із
    // прев'ю учасників — тими самими batch-запитами, без N+1.
    waitlistCount: 0,
    creatorReliable: false,
  }
}

/**
 * Fills in `participantPreview`, `waitlistCount` and (when a viewer is
 * known) `viewerWaitlistPosition` for a batch of events with a fixed
 * number of extra SQL queries — never one per event. Every
 * EventResponse-returning function below funnels through here, so the
 * API never does N+1 to build avatar previews or queue counters.
 */
async function attachParticipantPreviews(
  events: EventResponse[],
  viewerId?: string,
): Promise<EventResponse[]> {
  if (events.length === 0) return events
  const eventIds = events.map((event) => event.id)
  const creatorIds = [...new Set(events.map((event) => event.creatorId))]

  const [previews, waitlistCounts, viewerPositions, reliableFlags] = await Promise.all([
    eventsRepository.findParticipantPreviews(eventIds),
    eventsRepository.findWaitlistCounts(eventIds),
    viewerId
      ? eventsRepository.findWaitlistPositions(eventIds, viewerId)
      : Promise.resolve(new Map<string, number>()),
    getReliableOrganizerFlags(creatorIds),
  ])

  return events.map((event) => ({
    ...event,
    participantPreview: previews.get(event.id) ?? [],
    waitlistCount: waitlistCounts.get(event.id) ?? 0,
    viewerWaitlistPosition: viewerPositions.get(event.id),
    creatorReliable: reliableFlags.get(event.creatorId) ?? false,
  }))
}

async function attachParticipantPreview(
  event: EventResponse,
  viewerId?: string,
): Promise<EventResponse> {
  const [withPreview] = await attachParticipantPreviews([event], viewerId)
  return withPreview
}

/**
 * Просуває чергу після того, як звільнилось місце, і повідомляє тих,
 * кого перевели. Викликається з КОЖНОГО шляху, що звільняє місце
 * (вихід, видалення учасника організатором чи адміном, збільшення
 * ліміту, видалення користувача) — сама перестановка атомарна всередині
 * promote_event_waitlist.
 *
 * DM надсилаються вже ПІСЛЯ того, як просування закомічене, і їх збій
 * лише логується: людина вже в учасниках, і відкочувати це через
 * помилку Telegram не можна.
 *
 * Завершену подію не чіпаємо — у неї нікого не додають заднім числом.
 */
export async function promoteWaitlist(eventId: string): Promise<string[]> {
  const event = await eventsRepository.findById(eventId)
  if (!event || isKyivDateTimeInPast(event.date, event.time)) return []

  const promotedIds = await eventsRepository.promoteFromWaitlist(eventId)
  if (promotedIds.length === 0) return []

  const promotedUsers = await usersRepository.getUsersByIds(promotedIds)
  await mapWithConcurrency(promotedUsers, NOTIFICATION_CONCURRENCY, async (user) => {
    try {
      await sendWaitlistPromotionMessage(String(user.telegramId), {
        id: event.id,
        title: event.title,
      })
    } catch (error) {
      console.error(
        `Не вдалося сповістити користувача ${user.id} про місце у події ${eventId}:`,
        error,
      )
    }
  })

  return promotedIds
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
  userId: string,
): Promise<EventResponse[]> {
  const [includeVip, includeGpu] = await Promise.all([
    vipsRepository.isVip(userId),
    gpusRepository.isGpu(userId),
  ])
  if (userDormitoryId === NO_DORMITORY_ID) {
    const events = await eventsRepository.findAll(undefined, includeVip, true, includeGpu)
    return attachParticipantPreviews(events.map(toEventResponse), userId)
  }
  if (scope === 'mine') {
    if (!userDormitoryId) return []
    const events = await eventsRepository.findAll(userDormitoryId, includeVip, false, includeGpu)
    return attachParticipantPreviews(events.map(toEventResponse), userId)
  }

  const events = await eventsRepository.findAll(undefined, includeVip, false, includeGpu)
  return attachParticipantPreviews(events.map(toEventResponse), userId)
}

export async function getEvent(id: string, viewerId?: string): Promise<EventResponse> {
  const event = await getEventOrThrow(id)
  if (viewerId) {
    const [viewerIsVip, viewerIsGpu, viewer] = await Promise.all([
      vipsRepository.isVip(viewerId),
      gpusRepository.isGpu(viewerId),
      usersRepository.getUserById(viewerId),
    ])
    if (
      (event.vipOnly && !viewerIsVip) ||
      (event.gpuOnly && !viewerIsGpu) ||
      (!event.isOnline && viewer?.dormitoryId === NO_DORMITORY_ID)
    ) {
      throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
    }
  }
  return attachParticipantPreview(toEventResponse(event), viewerId)
}

export async function getEventShareLink(id: string, viewerId: string): Promise<string> {
  await getEvent(id, viewerId)
  return buildEventDeepLink(id)
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
  // Ті самі інваріанти, що й у updateOwnEvent — спільна функція, щоб
  // два шляхи запису не розійшлись знову.
  assertEventInvariants({
    dormitoryId: creatorDormitoryId,
    isOnline: input.isOnline,
    location: input.location,
    date: input.date,
    time: input.time,
    maxParticipants: input.maxParticipants,
    vipOnly: input.vipOnly,
    gpuOnly: input.gpuOnly,
  })
  if (input.vipOnly && !(await vipsRepository.isVip(creatorId))) {
    throw new AppError(403, 'VIP_ACCESS_REQUIRED', 'Недостатньо прав для VIP-події')
  }
  if (input.gpuOnly && !(await gpusRepository.isGpu(creatorId))) {
    throw new AppError(403, 'GPU_ACCESS_REQUIRED', 'Недостатньо прав для ГПУ-події')
  }

  const event = await eventsRepository.insert({
    creatorId,
    title: input.title,
    description: input.description,
    groupUrl: input.groupUrl,
    gameUrl: input.gameUrl,
    isOnline: input.isOnline,
    vipOnly: input.vipOnly,
    gpuOnly: input.gpuOnly,
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
    if (settings.chatId && !event.vipOnly && !event.gpuOnly) {
      await sendEventAnnouncement(settings.chatId, event, creatorInfo, settings.threadId)
    }
  } catch (error) {
    console.error('Не вдалося надіслати Telegram-анонс події:', error)
  }

  // Онлайн-подія доступна всім гуртожиткам — сповіщаємо всіх підписників.
  // Офлайн-подія лишається в межах свого гуртожитку — так само й тут.
  const requiredRole = event.vipOnly ? 'vip' : event.gpuOnly ? 'gpu' : undefined
  const subscriberIds = await usersRepository.getSubscribedTelegramIds(
    event.isOnline ? undefined : event.dormitoryId,
    requiredRole,
  )
  // Обмежена паралельність замість Promise.all по всьому списку: інакше
  // одна створена подія відкриває стільки одночасних запитів до Telegram,
  // скільки є підписників, і впирається в ліміти Bot API.
  await mapWithConcurrency(subscriberIds, NOTIFICATION_CONCURRENCY, async (telegramId) => {
    try {
      await sendEventAnnouncement(String(telegramId), event, creatorInfo, undefined, true)
    } catch (error) {
      // Невдача для одного отримувача не повинна ламати створення події.
      console.error(
        `Не вдалося надіслати особисте сповіщення про подію користувачу ${telegramId}:`,
        error,
      )
    }
  })
}

/**
 * Внутрішнє оновлення полів, які виставляє сам сервер (зараз — лише
 * обкладинка після успішної обробки завантаженого файлу). Недосяжне з
 * тіла HTTP-запиту: InternalEventPatch не входить у жодну Zod-схему.
 */
export async function updateEvent(
  id: string,
  patch: InternalEventPatch,
): Promise<EventResponse> {
  await getEventOrThrow(id)
  return attachParticipantPreview(toEventResponse(await eventsRepository.update(id, patch)))
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
  if ((event.vipOnly || input.vipOnly) && !(await vipsRepository.isVip(creatorId))) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
  if ((event.gpuOnly || input.gpuOnly) && !(await gpusRepository.isGpu(creatorId))) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }

  assertEventEditable(event)
  // Перевіряємо підсумковий стан події (поточні значення + патч), а не
  // сам патч: інакше, наприклад, зміна лише isOnline проскочила б повз
  // перевірку гуртожитку, бо в тілі запиту немає ні дати, ні місця.
  assertEventInvariants({
    dormitoryId: event.dormitoryId,
    isOnline: input.isOnline ?? event.isOnline,
    location: input.location ?? event.location,
    date: input.date ?? event.date,
    time: input.time ?? event.time,
    maxParticipants: input.maxParticipants ?? event.maxParticipants,
    currentParticipantCount: event.participantIds.length,
    vipOnly: input.vipOnly ?? event.vipOnly,
    gpuOnly: input.gpuOnly ?? event.gpuOnly,
  })

  const updated = await eventsRepository.update(id, input)
  // Підняли ліміт — з'явились вільні місця, які належать черзі. Скільки
  // саме людей перевести, вирішує promote_event_waitlist (цикл до
  // заповнення), тож кілька доданих місць дають кілька просувань.
  if (input.maxParticipants !== undefined && input.maxParticipants > event.maxParticipants) {
    await promoteWaitlist(id)
    return attachParticipantPreview(toEventResponse(await getEventOrThrow(id)), creatorId)
  }
  return attachParticipantPreview(toEventResponse(updated), creatorId)
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
  if (event.vipOnly && !(await vipsRepository.isVip(creatorId))) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
  if (event.gpuOnly && !(await gpusRepository.isGpu(creatorId))) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
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
  if (event.vipOnly && !(await vipsRepository.isVip(creatorId))) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
  if (event.gpuOnly && !(await gpusRepository.isGpu(creatorId))) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
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
  // Місце звільнилось — воно належить першому в черзі.
  await promoteWaitlist(eventId)
  return attachParticipantPreview(toEventResponse(await getEventOrThrow(eventId)), creatorId)
}

/**
 * «Чи взагалі існує ця подія для цього користувача»: гуртожиток для
 * офлайн-події плюс роль для VIP/ГПУ-події. Кожен провал — та сама 404,
 * що й для неіснуючої події, щоб не розкривати сам факт її існування.
 *
 * Спільна функція для join, waitlist-join і waitlist-leave: інакше
 * котрийсь із шляхів рано чи пізно виявився б м'якшим за решту.
 */
async function assertEventVisible(event: Event, userId: string): Promise<void> {
  const [viewer, isVip, isGpu] = await Promise.all([
    usersRepository.getUserById(userId),
    event.vipOnly ? vipsRepository.isVip(userId) : Promise.resolve(true),
    event.gpuOnly ? gpusRepository.isGpu(userId) : Promise.resolve(true),
  ])

  if (
    (!event.isOnline && viewer?.dormitoryId === NO_DORMITORY_ID) ||
    !isVip ||
    !isGpu
  ) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
}

/** Видимість + подія ще не завершилась. Спільний гейт для звичайного
 * приєднання і для вступу в чергу. */
async function assertEventJoinable(event: Event, userId: string): Promise<void> {
  await assertEventVisible(event, userId)
  if (isKyivDateTimeInPast(event.date, event.time)) {
    throw new AppError(409, 'EVENT_ARCHIVED', 'Цю подію вже завершено')
  }
}

export async function joinEvent(eventId: string, userId: string): Promise<EventResponse> {
  const event = await getEventOrThrow(eventId)
  await assertEventJoinable(event, userId)
  const participant = await usersRepository.getUserById(userId)
  // Перевірка ліміту місць і повторного приєднання відбувається
  // атомарно всередині PostgreSQL-функції join_event (repository),
  // тому тут немає окремого "прочитати → перевірити → вставити".
  await eventsRepository.addParticipant(eventId, userId)
  // participantPreview у відповіді дозволяє EventsProvider оновити
  // avatar-стек на картці, підмінивши лише цю подію в списку — без
  // повторного GET /api/events для всіх подій одразу.
  const response = await attachParticipantPreview(
    toEventResponse(await getEventOrThrow(eventId)),
    userId,
  )
  if (participant) {
    await sendEventJoinConfirmation(String(participant.telegramId), response).catch((error) => {
      console.error(`Не вдалося надіслати підтвердження приєднання користувачу ${userId}:`, error)
    })
  }
  return response
}

export async function leaveEvent(eventId: string, userId: string): Promise<EventResponse> {
  const event = await getEventOrThrow(eventId)
  if (event.vipOnly && !(await vipsRepository.isVip(userId))) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }
  if (event.gpuOnly && !(await gpusRepository.isGpu(userId))) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }

  const removed = await eventsRepository.removeParticipant(eventId, userId)
  if (!removed) {
    throw new AppError(409, 'NOT_PARTICIPATING', 'Ви не берете участі у цій події')
  }

  await promoteWaitlist(eventId)
  return attachParticipantPreview(toEventResponse(await getEventOrThrow(eventId)), userId)
}

/**
 * Вступ до черги на заповнену подію. Уся перевірка (заповненість, ролі,
 * дублі, участь) відбувається атомарно всередині join_event_waitlist під
 * `for update` на рядку події.
 *
 * Якщо між натисканням і запитом місце встигло звільнитись, функція
 * повертає EVENT_NOT_FULL — тоді замість черги виконуємо звичайне
 * приєднання, щоб користувач не отримав порожню помилку через те, що
 * йому пощастило.
 */
export async function joinEventWaitlist(
  eventId: string,
  userId: string,
): Promise<EventResponse> {
  const event = await getEventOrThrow(eventId)
  await assertEventJoinable(event, userId)

  try {
    await eventsRepository.joinWaitlist(eventId, userId)
  } catch (error) {
    if (error instanceof EventNotFullError) {
      return joinEvent(eventId, userId)
    }
    throw error
  }

  return attachParticipantPreview(toEventResponse(await getEventOrThrow(eventId)), userId)
}

export async function leaveEventWaitlist(
  eventId: string,
  userId: string,
): Promise<EventResponse> {
  const event = await getEventOrThrow(eventId)
  await assertEventVisible(event, userId)

  const removed = await eventsRepository.leaveWaitlist(eventId, userId)
  if (!removed) {
    throw new AppError(409, 'NOT_WAITLISTED', 'Ви не в черзі на цю подію')
  }

  return attachParticipantPreview(toEventResponse(await getEventOrThrow(eventId)), userId)
}

/** Впорядкований список черги з публічними профілями — лише для
 * організатора й адміна. Звичайному користувачу сервіс його не віддає
 * (він бачить тільки waitlistCount і власну позицію). */
export async function listEventWaitlist(
  eventId: string,
  viewerId: string,
  privileged = false,
): Promise<PublicUser[]> {
  const event = await getEventOrThrow(eventId)
  if (!privileged && event.creatorId !== viewerId) {
    throw new AppError(403, 'EVENT_OWNER_REQUIRED', 'Список черги доступний лише автору події')
  }

  const userIds = await eventsRepository.getWaitlistUserIds(eventId)
  if (userIds.length === 0) return []

  const users = await usersRepository.getPublicUsersByIds(userIds)
  const byId = new Map(users.map((user) => [user.id, user]))
  // Порядок черги задає SQL — не порядок, у якому повернувся batch.
  return userIds.map((id) => byId.get(id) ?? { id, firstName: 'Учасник DormHub' })
}

/** Організатор або адмін знімає когось із черги. */
export async function removeFromEventWaitlist(
  eventId: string,
  actorId: string,
  targetUserId: string,
  privileged = false,
): Promise<void> {
  const event = await getEventOrThrow(eventId)
  if (!privileged) {
    await assertEventVisible(event, actorId)
    if (event.creatorId !== actorId) {
      throw new AppError(403, 'EVENT_OWNER_REQUIRED', 'Керувати чергою може лише автор події')
    }
  }

  const removed = await eventsRepository.leaveWaitlist(eventId, targetUserId)
  if (!removed) {
    throw new AppError(404, 'NOT_WAITLISTED', 'Цього користувача немає в черзі')
  }
}

/** Один batch-запит прев'ю на ОБИДВА списки разом (а не по одному на
 * кожен) — id подій об'єднуються перед єдиним викликом repository. */
export async function listEventsForUser(
  userId: string,
  viewerId = userId,
  privileged = false,
): Promise<UserEvents> {
  const [created, participating] = await Promise.all([
    eventsRepository.getUserCreatedEvents(userId),
    eventsRepository.getUserParticipatingEvents(userId),
  ])

  const [viewerIsVip, viewerIsGpu, viewer] = await Promise.all([
    vipsRepository.isVip(viewerId),
    gpusRepository.isGpu(viewerId),
    usersRepository.getUserById(viewerId),
  ])
  const includeVip = privileged || viewerIsVip
  const includeGpu = privileged || viewerIsGpu
  const viewerOnlineOnly = !privileged && viewer?.dormitoryId === NO_DORMITORY_ID
  const visible = (event: Event): boolean =>
    (!viewerOnlineOnly || event.isOnline) &&
    (includeVip || !event.vipOnly) &&
    (includeGpu || !event.gpuOnly)
  const createdResponses = created.filter(visible).map(toEventResponse)
  const participatingResponses = participating.filter(visible).map(toEventResponse)
  const eventIds = [
    ...new Set([...createdResponses, ...participatingResponses].map((event) => event.id)),
  ]
  const creatorIds = [
    ...new Set([...createdResponses, ...participatingResponses].map((event) => event.creatorId)),
  ]
  const [previews, waitlistCounts, viewerPositions, reliableFlags] = await Promise.all([
    eventsRepository.findParticipantPreviews(eventIds),
    eventsRepository.findWaitlistCounts(eventIds),
    eventsRepository.findWaitlistPositions(eventIds, viewerId),
    getReliableOrganizerFlags(creatorIds),
  ])
  const withPreview = (event: EventResponse): EventResponse => ({
    ...event,
    participantPreview: previews.get(event.id) ?? [],
    waitlistCount: waitlistCounts.get(event.id) ?? 0,
    viewerWaitlistPosition: viewerPositions.get(event.id),
    creatorReliable: reliableFlags.get(event.creatorId) ?? false,
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

export async function createEventFromTemplate(
  templateId: string,
  creatorId: string,
  creatorDormitoryId: string | undefined,
  /** Дата й час завжди вводяться під час запуску. null для gameUrl означає, що
   * користувач свідомо залишив поле порожнім; undefined — старий клієнт,
   * для якого використовуємо значення шаблону. */
  date: string,
  time: string,
  maxParticipants: number,
  overrideGameUrl?: string | null,
): Promise<EventResponse> {
  const template = await eventTemplatesRepository.findById(templateId)
  if (!template) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Шаблон не знайдено')
  if (creatorDormitoryId === NO_DORMITORY_ID && !template.isOnline) {
    throw new AppError(
      400,
      'ONLINE_EVENT_REQUIRED',
      'Без гуртожитку можна запускати лише онлайн-шаблони',
    )
  }

  const gameUrl = overrideGameUrl === undefined
    ? template.gameUrl
    : overrideGameUrl ?? undefined
  if (template.gameUrlRequired && !gameUrl) {
    throw new AppError(400, 'GAME_URL_REQUIRED', 'Вкажіть посилання на гру')
  }

  try {
    const event = await createEvent(
      creatorId,
      template.dormitoryId ?? creatorDormitoryId,
      {
        title: template.title,
        description: template.description,
        date,
        time,
        location: template.isOnline ? 'Онлайн' : template.location,
        isOnline: template.isOnline,
        vipOnly: false,
        gpuOnly: false,
        maxParticipants,
        groupUrl: template.groupUrl,
        gameUrl,
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
      throw new AppError(409, 'EVENT_ALREADY_CREATED', 'Подію з цього шаблону на обрану дату вже створено')
    }
    throw error
  }
}
