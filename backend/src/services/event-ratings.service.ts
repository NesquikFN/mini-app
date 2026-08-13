import { eventRatingsRepository } from '../repositories/event-ratings.repository'
import { AppError } from '../utils/AppError'
import { isKyivDateTimeInPast, isRatingWindowOpen } from '../utils/kyivTime'
import * as eventsService from './events.service'
import type { EventResponse } from './events.service'
import type { SubmitEventRatingInput } from '../validation/event-rating.schemas'
import type { AdminEventRatingEntry, EventRatingSelfResponse } from '../types/eventRating'

/** Скільки днів після завершення події ще можна лишити оцінку. */
export const RATING_WINDOW_DAYS = 7
/** Скільки часу після ПЕРШОГО голосу можна його змінити. */
const RATING_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Той самий 404, що й для неіснуючої/недоступної події (VIP/ГПУ/чужий
 * гуртожиток) — eventsService.getEvent уже реалізує це правило, тож
 * оцінка успадковує його, не дублюючи перевірки.
 */
async function loadEventForRating(eventId: string, userId: string): Promise<EventResponse> {
  return eventsService.getEvent(eventId, userId)
}

/** Базова допустимість оцінювання (без урахування 24-годинного вікна
 * редагування вже наявного голосу — воно перевіряється окремо, бо
 * залежить від конкретного рядка event_ratings, а не лише від події). */
function computeBaseCanRate(event: EventResponse, userId: string): boolean {
  const isParticipant = event.participants.includes(userId)
  const isOrganizer = event.creatorId === userId
  if (!isParticipant || isOrganizer) return false
  if (!isKyivDateTimeInPast(event.date, event.time)) return false
  return isRatingWindowOpen(event.date, event.time, RATING_WINDOW_DAYS)
}

export async function getMyRating(eventId: string, userId: string): Promise<EventRatingSelfResponse> {
  const event = await loadEventForRating(eventId, userId)
  const baseCanRate = computeBaseCanRate(event, userId)

  const row = await eventRatingsRepository.findByEventAndUser(eventId, userId)
  if (!row) {
    return { myRating: null, canRate: baseCanRate }
  }

  const tags = await eventRatingsRepository.getTags(row.id)
  const withinEditWindow =
    row.moderated_at === null &&
    Date.now() - new Date(row.created_at).getTime() <= RATING_EDIT_WINDOW_MS

  return {
    myRating: {
      rating: row.rating,
      tags,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    canRate: baseCanRate && withinEditWindow,
  }
}

/**
 * userId/organizerId ніколи не приходять з тіла запиту — organizerId
 * тут завжди event.creatorId, прочитаний тим самим шляхом, що й для
 * gate-перевірок вище, тож підмінити "чию репутацію" зачіпає ця оцінка
 * неможливо навіть непрямо.
 */
export async function submitRating(
  eventId: string,
  userId: string,
  input: SubmitEventRatingInput,
): Promise<EventRatingSelfResponse> {
  const event = await loadEventForRating(eventId, userId)

  if (!event.participants.includes(userId)) {
    throw new AppError(403, 'NOT_A_PARTICIPANT', 'Оцінювати можуть лише учасники події')
  }
  if (event.creatorId === userId) {
    throw new AppError(403, 'ORGANIZER_CANNOT_RATE', 'Організатор не може оцінювати власну подію')
  }
  if (!isKyivDateTimeInPast(event.date, event.time)) {
    throw new AppError(409, 'EVENT_NOT_FINISHED', 'Оцінити подію можна лише після її завершення')
  }
  if (!isRatingWindowOpen(event.date, event.time, RATING_WINDOW_DAYS)) {
    throw new AppError(409, 'RATING_WINDOW_CLOSED', 'Строк оцінювання цієї події вже минув')
  }

  const ratingId = await eventRatingsRepository.upsert(
    eventId,
    userId,
    event.creatorId,
    input.rating,
    input.tags,
  )

  if (!ratingId) {
    const existing = await eventRatingsRepository.findByEventAndUser(eventId, userId)
    if (existing?.moderated_at) {
      throw new AppError(409, 'RATING_MODERATED', 'Цю оцінку виключив модератор — змінити її не можна')
    }
    throw new AppError(
      409,
      'RATING_EDIT_WINDOW_CLOSED',
      'Змінити оцінку можна лише протягом 24 годин після першого голосу',
    )
  }

  return getMyRating(eventId, userId)
}

export async function getEventRatingsForAdmin(eventId: string): Promise<AdminEventRatingEntry[]> {
  const rows = await eventRatingsRepository.listForEvent(eventId)
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.nickname ?? row.first_name,
    rating: row.rating,
    tags: row.tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    moderatedAt: row.moderated_at ?? undefined,
    removedBy: row.removed_by ?? undefined,
  }))
}

export async function moderateRating(ratingId: string, adminId: string): Promise<void> {
  const success = await eventRatingsRepository.moderate(ratingId, adminId)
  if (!success) {
    throw new AppError(404, 'RATING_NOT_FOUND', 'Оцінку не знайдено або вона вже виключена')
  }
}

export async function restoreRating(ratingId: string): Promise<void> {
  const success = await eventRatingsRepository.restore(ratingId)
  if (!success) {
    throw new AppError(404, 'RATING_NOT_FOUND', 'Оцінку не знайдено або вона й так активна')
  }
}
