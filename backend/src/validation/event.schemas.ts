import { z } from 'zod'
import { isPastDate, isValidCalendarDate } from '../utils/date'
import { uuidParam } from './common.schemas'
import { MAX_EVENT_PARTICIPANTS } from '../services/event-invariants'

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата має бути у форматі РРРР-ММ-ДД')
  .refine(isValidCalendarDate, 'Некоректна дата')
  // Груба перевірка «не вчора» на рівні поля; точна перевірка «дата+час
  // не в минулому» — у assertEventInvariants, бо потребує обох полів
  // разом (сьогодні о 08:00 — валідна дата, але вже минулий час).
  .refine((value) => !isPastDate(value), 'Дата не може бути в минулому')

export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Час має бути у форматі ГГ:ХХ')

const telegramGroupUrlSchema = z
  .string()
  .trim()
  .refine((value) => {
    if (/^@[A-Za-z0-9_]+$/.test(value)) return true
    try {
      const url = new URL(value)
      // Протокол обмежений явно (не лише hostname), щоб відсікти
      // javascript:/data:/file: — існуючі http-посилання лишаються
      // валідними, щоб не ламати редагування старих подій.
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        ['t.me', 'telegram.me'].includes(url.hostname)
      )
    } catch {
      return false
    }
  }, 'Вкажіть @name або посилання на Telegram-групу')
  .transform((value) =>
    value.startsWith('@') ? `https://t.me/${value.slice(1)}` : value,
  )

const gameUrlSchema = z
  .string()
  .trim()
  .refine((value) => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol)
    } catch {
      return false
    }
  }, 'Вкажіть коректне посилання на гру')

const maxParticipantsSchema = z
  .number('Максимальна кількість учасників має бути числом')
  .int('Має бути цілим числом')
  .positive('Має бути більше 0')
  .max(MAX_EVENT_PARTICIPANTS, `Максимум ${MAX_EVENT_PARTICIPANTS} учасників`)

const titleSchema = z.string().trim().min(1, 'Назва обовʼязкова').max(200, 'Назва занадто довга')
const descriptionSchema = z.string().trim().max(4000, 'Опис занадто довгий')
const locationSchema = z
  .string()
  .trim()
  .min(1, 'Місце обовʼязкове')
  .max(300, 'Назва місця занадто довга')

export const createEventSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.default(''),
    date: dateSchema,
    time: timeSchema,
    location: locationSchema,
    groupUrl: telegramGroupUrlSchema.optional(),
    gameUrl: gameUrlSchema.optional(),
    deferNotification: z.boolean().optional(),
    isOnline: z.boolean().default(false),
    vipOnly: z.boolean().default(false),
    gpuOnly: z.boolean().default(false),
    maxParticipants: maxParticipantsSchema,
  })
  .refine((value) => !(value.vipOnly && value.gpuOnly), {
    message: 'Подія не може бути одночасно VIP-only і ГПУ-only',
    path: ['gpuOnly'],
  })

export type CreateEventInput = z.infer<typeof createEventSchema>

/**
 * Схема часткового оновлення. Навмисно НЕ createEventSchema.partial():
 * у Zod `.partial()` не знімає `.default()`, тож для відсутніх у тілі
 * полів схема все одно підставляла б значення за замовчуванням. А
 * оскільки repository пише кожне поле, що !== undefined, будь-який
 * PATCH (навіть зміна самої лише назви) тихо перезаписував би
 * is_online = false, is_vip_only = false і description = null —
 * тобто редагування VIP-події знімало б із неї VIP і відкривало її
 * всім. Тут кожне поле оголошене окремо й справді опціональне.
 *
 * imageUrl відсутній свідомо: обкладинку виставляє лише сервер у
 * PUT /api/events/:id/image після успішної обробки файлу — інакше автор
 * міг би підставити довільний зовнішній URL, який вантажив би браузер
 * кожного глядача.
 */
export const updateEventSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    date: dateSchema.optional(),
    time: timeSchema.optional(),
    location: locationSchema.optional(),
    groupUrl: telegramGroupUrlSchema.optional(),
    gameUrl: gameUrlSchema.optional(),
    isOnline: z.boolean().optional(),
    vipOnly: z.boolean().optional(),
    gpuOnly: z.boolean().optional(),
    maxParticipants: maxParticipantsSchema.optional(),
  })
  .refine((value) => !(value.vipOnly && value.gpuOnly), {
    message: 'Подія не може бути одночасно VIP-only і ГПУ-only',
    path: ['gpuOnly'],
  })

export type UpdateEventInput = z.infer<typeof updateEventSchema>

/** Внутрішній патч, недосяжний з HTTP-тіла: лише те, що виставляє сам
 * сервер після обробки завантаженого файлу. */
export interface InternalEventPatch {
  imageUrl?: string
}

export const eventIdParamSchema = z.object({
  id: uuidParam('Некоректний ідентифікатор події'),
})

// 'mine' за замовчуванням — сервер сам вирішує, що таке "мій гуртожиток"
// (req.user.dormitoryId), клієнт лише обирає між своїм і "усі".
export const eventsListQuerySchema = z.object({
  scope: z.enum(['mine', 'all']).catch('mine'),
})

export const userIdParamSchema = z.object({
  userId: uuidParam('Некоректний ідентифікатор користувача'),
})

export const eventTemplateIdParamSchema = z.object({
  templateId: uuidParam('Некоректний шаблон'),
})

export const createEventFromTemplateSchema = z.object({
  date: dateSchema,
  time: timeSchema,
  maxParticipants: maxParticipantsSchema,
  gameUrl: gameUrlSchema.nullable().optional(),
})

export const eventTemplateSchema = z
  .object({
    title: z.string().trim().min(1, 'Назва обовʼязкова').max(200, 'Назва занадто довга'),
    description: z.string().trim().max(4000, 'Опис занадто довгий').default(''),
    location: z.string().trim().min(1, 'Місце обовʼязкове').max(300, 'Назва місця занадто довга'),
    isOnline: z.boolean().default(false),
    groupUrl: telegramGroupUrlSchema.optional(),
    gameUrl: gameUrlSchema.optional(),
    gameUrlRequired: z.boolean().default(false),
    dormitoryId: uuidParam('Некоректний гуртожиток').optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.isOnline && !value.dormitoryId) {
      ctx.addIssue({
        code: 'custom',
        path: ['dormitoryId'],
        message: 'Оберіть гуртожиток для офлайн-події',
      })
    }
  })
