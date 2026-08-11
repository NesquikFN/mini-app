import type { PublicUser } from './user'

export const QUICK_PLAN_CATEGORIES = ['sport', 'study', 'food', 'walk', 'games', 'other'] as const

export type QuickPlanCategory = (typeof QUICK_PLAN_CATEGORIES)[number]

export const QUICK_PLAN_LIFETIMES = ['3h', '6h', '12h', 'today'] as const

export type QuickPlanLifetime = (typeof QUICK_PLAN_LIFETIMES)[number]

export interface QuickPlan {
  id: string
  creatorId: string
  text: string
  category: QuickPlanCategory
  isOnline: boolean
  /** undefined для онлайн-плану — він глобальний. */
  dormitoryId?: string
  expiresAt: string
  createdAt: string
  creator: PublicUser
  participants: PublicUser[]
  participantCount: number
  /** Чи відгукнувся поточний користувач — рахує сервер, не клієнт. */
  joined: boolean
}

export interface CreateQuickPlanInput {
  text: string
  category: QuickPlanCategory
  isOnline: boolean
  lifetime: QuickPlanLifetime
}

export const QUICK_PLAN_CATEGORY_LABELS: Record<QuickPlanCategory, string> = {
  sport: 'Спорт',
  study: 'Навчання',
  food: 'Їжа',
  walk: 'Прогулянка',
  games: 'Ігри',
  other: 'Інше',
}

export const QUICK_PLAN_LIFETIME_LABELS: Record<QuickPlanLifetime, string> = {
  '3h': '3 години',
  '6h': '6 годин',
  '12h': '12 годин',
  today: 'До кінця дня',
}
