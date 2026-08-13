import { eventRatingsRepository } from '../repositories/event-ratings.repository'
import { usersRepository } from '../repositories/users.repository'
import { AppError } from '../utils/AppError'
import { isUserBanned } from '../utils/ban'
import { kyivTimestamp } from '../utils/kyivTime'
import {
  MIN_RATINGS_FOR_PUBLIC_AVERAGE,
  RELIABLE_ORGANIZER_MIN_AVERAGE,
  RELIABLE_ORGANIZER_MIN_COMPLETED_EVENTS,
  RELIABLE_ORGANIZER_MIN_RATINGS,
  type AdminOrganizerReputation,
  type OrganizerReputationResponse,
} from '../types/eventRating'

/**
 * Обчислення репутації навмисно винесене з event-ratings.service.ts в
 * окремий файл БЕЗ залежності від events.service.ts: events.service.ts
 * сам імпортує цей модуль (щоб додати прапорець "Надійний організатор"
 * до EventResponse для EventCard), а event-ratings.service.ts імпортує
 * events.service.ts (щоб перевірити право оцінювати) — тримати обидві
 * залежності в одному файлі означало б цикл events.service ↔
 * event-ratings.service.
 */

/**
 * Чисте правило бейджа «Надійний організатор» — жодних запитів у БД,
 * лише готові цифри. Юніт-тестується без бази; той самий поріг
 * використовує публічний профіль, адмінська сторінка користувача й
 * пакетний прапорець для EventCard.
 */
export function computeIsReliableOrganizer(stats: {
  completedEvents: number
  ratingsCount: number
  avgRating: number | null
  organizerBanned: boolean
}): boolean {
  if (stats.organizerBanned) return false
  if (stats.completedEvents < RELIABLE_ORGANIZER_MIN_COMPLETED_EVENTS) return false
  if (stats.ratingsCount < RELIABLE_ORGANIZER_MIN_RATINGS) return false
  if (stats.avgRating === null || stats.avgRating < RELIABLE_ORGANIZER_MIN_AVERAGE) return false
  return true
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

export async function getOrganizerReputation(organizerId: string): Promise<OrganizerReputationResponse> {
  const user = await usersRepository.getUserById(organizerId)
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено')
  }

  const nowTs = kyivTimestamp()
  const [participation, ratings, topTags] = await Promise.all([
    eventRatingsRepository.getOrganizerParticipationStats([organizerId], nowTs),
    eventRatingsRepository.getOrganizerRatingStats([organizerId]),
    eventRatingsRepository.getTopTags(organizerId),
  ])
  const p = participation.get(organizerId) ?? { completedEvents: 0, totalParticipants: 0 }
  const r = ratings.get(organizerId) ?? { ratingsCount: 0, avgRating: null }

  return {
    averageRating:
      r.ratingsCount >= MIN_RATINGS_FOR_PUBLIC_AVERAGE && r.avgRating !== null
        ? roundToOneDecimal(r.avgRating)
        : undefined,
    ratingsCount: r.ratingsCount,
    completedEventsCount: p.completedEvents,
    totalParticipantsInCompletedEvents: p.totalParticipants,
    topTags,
    isReliableOrganizer: computeIsReliableOrganizer({
      completedEvents: p.completedEvents,
      ratingsCount: r.ratingsCount,
      avgRating: r.avgRating,
      organizerBanned: isUserBanned(user),
    }),
  }
}

/** Адмінський варіант — на відміну від публічного, середню оцінку не
 * ховає нижче MIN_RATINGS_FOR_PUBLIC_AVERAGE (адміну потрібна повна
 * картина), і додає розподіл 1..5. */
export async function getAdminOrganizerReputation(organizerId: string): Promise<AdminOrganizerReputation> {
  const nowTs = kyivTimestamp()
  const [participation, ratings, distribution, user] = await Promise.all([
    eventRatingsRepository.getOrganizerParticipationStats([organizerId], nowTs),
    eventRatingsRepository.getOrganizerRatingStats([organizerId]),
    eventRatingsRepository.getRatingDistribution(organizerId),
    usersRepository.getAdminUserById(organizerId),
  ])
  const p = participation.get(organizerId) ?? { completedEvents: 0, totalParticipants: 0 }
  const r = ratings.get(organizerId) ?? { ratingsCount: 0, avgRating: null }
  const organizerBanned = user ? isUserBanned(user) : false

  return {
    averageRating: r.avgRating !== null ? roundToOneDecimal(r.avgRating) : undefined,
    ratingsCount: r.ratingsCount,
    completedEventsCount: p.completedEvents,
    distribution,
    isReliableOrganizer: computeIsReliableOrganizer({
      completedEvents: p.completedEvents,
      ratingsCount: r.ratingsCount,
      avgRating: r.avgRating,
      organizerBanned,
    }),
  }
}

/**
 * Пакетний прапорець «Надійний організатор» для списку подій
 * (EventCard) — один запит на статистику участі, один на оцінки, один
 * на бан-статус, замість N+1 на кожну картку. Викликається з
 * events.service.attachParticipantPreviews — тобто з КОЖНОЇ відповіді,
 * що містить подію. Тому єдиний try/catch тут: бейдж репутації
 * необов'язковий (лише декоративний), і жодна його помилка не повинна
 * заважати базовому перегляду подій — гірше було б віддати 500 замість
 * події через збій суто косметичного підрахунку.
 */
export async function getReliableOrganizerFlags(organizerIds: string[]): Promise<Map<string, boolean>> {
  const uniqueIds = [...new Set(organizerIds)]
  const result = new Map<string, boolean>()
  if (uniqueIds.length === 0) return result

  try {
    const nowTs = kyivTimestamp()
    const [participation, ratings, users] = await Promise.all([
      eventRatingsRepository.getOrganizerParticipationStats(uniqueIds, nowTs),
      eventRatingsRepository.getOrganizerRatingStats(uniqueIds),
      usersRepository.getUsersByIds(uniqueIds),
    ])
    const bannedById = new Map(users.map((user) => [user.id, isUserBanned(user)]))

    for (const id of uniqueIds) {
      const p = participation.get(id) ?? { completedEvents: 0, totalParticipants: 0 }
      const r = ratings.get(id) ?? { ratingsCount: 0, avgRating: null }
      result.set(
        id,
        computeIsReliableOrganizer({
          completedEvents: p.completedEvents,
          ratingsCount: r.ratingsCount,
          avgRating: r.avgRating,
          organizerBanned: bannedById.get(id) ?? false,
        }),
      )
    }
    return result
  } catch (error) {
    console.error('Не вдалося обчислити бейдж "Надійний організатор":', error)
    return result
  }
}
