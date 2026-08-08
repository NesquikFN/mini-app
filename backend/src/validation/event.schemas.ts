import { z } from 'zod'
import { isPastDate, isValidCalendarDate } from '../utils/date'

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата має бути у форматі РРРР-ММ-ДД')
  .refine(isValidCalendarDate, 'Некоректна дата')
  .refine((value) => !isPastDate(value), 'Дата не може бути в минулому')

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Час має бути у форматі ГГ:ХХ')

const telegramGroupUrlSchema = z
  .string()
  .trim()
  .refine((value) => {
    if (/^@[A-Za-z0-9_]+$/.test(value)) return true
    try {
      return ['t.me', 'telegram.me'].includes(new URL(value).hostname)
    } catch {
      return false
    }
  }, 'Вкажіть @name або посилання на Telegram-групу')
  .transform((value) =>
    value.startsWith('@') ? `https://t.me/${value.slice(1)}` : value,
  )

export const createEventSchema = z.object({
  title: z.string().trim().min(1, 'Назва обовʼязкова'),
  description: z.string().trim().default(''),
  date: dateSchema,
  time: timeSchema,
  location: z.string().trim().min(1, 'Місце обовʼязкове'),
  groupUrl: telegramGroupUrlSchema.optional(),
  deferNotification: z.boolean().optional(),
  isOnline: z.boolean().default(false),
  maxParticipants: z
    .number('Максимальна кількість учасників має бути числом')
    .int('Має бути цілим числом')
    .positive('Має бути більше 0'),
})

export type CreateEventInput = z.infer<typeof createEventSchema>

// Той самий набір правил (дата не в минулому, формат часу тощо), але всі
// поля опціональні — адмін-панель редагує подію частково (PATCH), а не
// пересилає весь об'єкт заново.
export const updateEventSchema = createEventSchema.partial().extend({
  imageUrl: z.url().optional(),
})

export type UpdateEventInput = z.infer<typeof updateEventSchema>

export const eventIdParamSchema = z.object({
  id: z.string().min(1, 'Ідентифікатор події обовʼязковий'),
})

// 'mine' за замовчуванням — сервер сам вирішує, що таке "мій гуртожиток"
// (req.user.dormitoryId), клієнт лише обирає між своїм і "усі".
export const eventsListQuerySchema = z.object({
  scope: z.enum(['mine', 'all']).catch('mine'),
})

export const userIdParamSchema = z.object({
  userId: z.string().min(1, 'Ідентифікатор користувача обовʼязковий'),
})

export const eventTemplateIdParamSchema = z.object({
  templateId: z.uuid('Некоректний шаблон'),
})
