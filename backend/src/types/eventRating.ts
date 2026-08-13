/** Значення продубльовані у CHECK-обмеженні event_rating_tags_valid у
 * database/schema.sql — міняти лише разом. */
export const EVENT_RATING_TAGS = [
  'well_organized',
  'good_atmosphere',
  'started_on_time',
  'friendly_participants',
  'want_more',
] as const

export type EventRatingTag = (typeof EVENT_RATING_TAGS)[number]

/** Пороги автоматичного бейджа «Надійний організатор» — обчислюється на
 * льоту з актуальних даних, ніде не зберігається (див.
 * event-ratings.service.ts computeIsReliableOrganizer). */
export const RELIABLE_ORGANIZER_MIN_COMPLETED_EVENTS = 3
export const RELIABLE_ORGANIZER_MIN_RATINGS = 10
export const RELIABLE_ORGANIZER_MIN_AVERAGE = 4.3

/** Середню оцінку не показують публічно, поки відгуків замало —
 * замало даних, щоб число щось означало. */
export const MIN_RATINGS_FOR_PUBLIC_AVERAGE = 3

export interface EventRatingSelf {
  rating: number
  tags: EventRatingTag[]
  createdAt: string
  updatedAt: string
}

export interface EventRatingSelfResponse {
  myRating: EventRatingSelf | null
  /** Авторитетна відповідь сервера "чи спрацював би зараз PUT" — той
   * самий гейт, що й сам PUT (одна функція, спільна для обох). Frontend
   * ніколи не вирішує це самостійно. */
  canRate: boolean
}

export interface OrganizerReputationResponse {
  /** undefined, поки ratingsCount < MIN_RATINGS_FOR_PUBLIC_AVERAGE. */
  averageRating?: number
  ratingsCount: number
  completedEventsCount: number
  /** "Учасників у проведених подіях" — НЕ підтверджена присутність,
   * лише зареєстрована участь у вже завершених подіях. */
  totalParticipantsInCompletedEvents: number
  topTags: EventRatingTag[]
  isReliableOrganizer: boolean
}

export interface AdminEventRatingEntry {
  id: string
  userId: string
  userName: string
  rating: number
  tags: EventRatingTag[]
  createdAt: string
  updatedAt: string
  moderatedAt?: string
  removedBy?: string
}

export interface AdminOrganizerReputation {
  averageRating?: number
  ratingsCount: number
  completedEventsCount: number
  /** Кількість оцінок 1..5 — індекс 0 відповідає оцінці 1. */
  distribution: [number, number, number, number, number]
  isReliableOrganizer: boolean
}
