import type { PublicUser } from './user'

/** Категорії швидкого плану. Значення збігаються з CHECK-обмеженням
 * quick_plans_category_valid у database/schema.sql — міняти лише разом. */
export const QUICK_PLAN_CATEGORIES = ['sport', 'study', 'food', 'walk', 'games', 'other'] as const

export type QuickPlanCategory = (typeof QUICK_PLAN_CATEGORIES)[number]

/** Скільки годин живе план. «До кінця дня» рахується окремо (кінець
 * київської доби), тому це не просто число годин. */
export const QUICK_PLAN_LIFETIMES = ['3h', '6h', '12h', 'today'] as const

export type QuickPlanLifetime = (typeof QUICK_PLAN_LIFETIMES)[number]

export interface QuickPlan {
  id: string
  creatorId: string
  text: string
  category: QuickPlanCategory
  isOnline: boolean
  /** null для онлайн-плану — він глобальний. */
  dormitoryId?: string
  expiresAt: string
  createdAt: string
}

/** Те, що бачить клієнт: план плюс публічні профілі автора й тих, хто
 * відгукнувся. Автор у participants не входить (він не записується
 * автоматично — див. quick-plans.service.ts). */
export interface QuickPlanResponse extends QuickPlan {
  creator: PublicUser
  participants: PublicUser[]
  participantCount: number
  /** Чи відгукнувся сам глядач — щоб клієнт одразу показав «Не піду». */
  joined: boolean
}
