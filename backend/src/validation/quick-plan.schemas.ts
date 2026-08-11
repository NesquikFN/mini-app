import { z } from 'zod'
import { uuidParam } from './common.schemas'
import { QUICK_PLAN_CATEGORIES, QUICK_PLAN_LIFETIMES } from '../types/quick-plan'

/**
 * Схема створення швидкого плану. Навмисно НЕ приймає ні creatorId, ні
 * dormitoryId, ні expiresAt: усі три виставляє сервер (creatorId і
 * dormitoryId — із сесії, expiresAt — з lifetime). Zod відкидає невідомі
 * поля за замовчуванням, тож підмінити їх через тіло запиту структурно
 * неможливо — рівно той самий підхід, що й у createEventSchema.
 *
 * Текст обрізається (.trim()) ДО перевірки довжини, інакше рядок із
 * самих пробілів проходив би як «10 символів».
 */
export const createQuickPlanSchema = z.object({
  text: z
    .string('Опишіть, що плануєте')
    .trim()
    .min(10, 'Мінімум 10 символів')
    .max(180, 'Максимум 180 символів'),
  category: z.enum(QUICK_PLAN_CATEGORIES, { message: 'Оберіть категорію' }),
  isOnline: z.boolean().default(false),
  lifetime: z.enum(QUICK_PLAN_LIFETIMES).default('6h'),
})

export type CreateQuickPlanInput = z.infer<typeof createQuickPlanSchema>

export const quickPlanIdParamSchema = z.object({
  id: uuidParam('Некоректний ідентифікатор плану'),
})
