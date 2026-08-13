export const EVENT_RATING_TAGS = [
  'well_organized',
  'good_atmosphere',
  'started_on_time',
  'friendly_participants',
  'want_more',
] as const

export type EventRatingTag = (typeof EVENT_RATING_TAGS)[number]

export const EVENT_RATING_TAG_LABELS: Record<EventRatingTag, string> = {
  well_organized: 'Гарна організація',
  good_atmosphere: 'Цікава атмосфера',
  started_on_time: 'Все почалося вчасно',
  friendly_participants: 'Приємні учасники',
  want_more: 'Хочу ще',
}

export const EVENT_RATING_LABELS: Record<number, string> = {
  1: 'Погано',
  2: 'Посередньо',
  3: 'Нормально',
  4: 'Добре',
  5: 'Чудово',
}

export interface EventRatingSelf {
  rating: number
  tags: EventRatingTag[]
  createdAt: string
  updatedAt: string
}

export interface EventRatingSelfResponse {
  myRating: EventRatingSelf | null
  canRate: boolean
}

export interface OrganizerReputation {
  averageRating?: number
  ratingsCount: number
  completedEventsCount: number
  totalParticipantsInCompletedEvents: number
  topTags: EventRatingTag[]
  isReliableOrganizer: boolean
}
