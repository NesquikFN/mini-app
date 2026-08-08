import { z } from 'zod'

export const notificationSettingsSchema = z.object({
  chatId: z.string().regex(/^-?\d+$/, 'Некоректний Telegram chat_id').nullable(),
  chatTitle: z.string().trim().min(1).nullable(),
}).refine((value) => (value.chatId === null) === (value.chatTitle === null), {
  message: 'Чат і його назва мають бути вказані разом',
})

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().catch(1),
  limit: z.coerce.number().int().positive().max(100).catch(20),
})

export const usersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
})

export const eventsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  date: z.enum(['today', 'week', 'all']).catch('all'),
})

export const userIdParamSchema = z.object({
  id: z.string().min(1, 'Ідентифікатор користувача обовʼязковий'),
})

export const addAdminSchema = z.object({
  telegramId: z.number('Telegram ID має бути числом').int().positive(),
})

export const adminUserIdParamSchema = z.object({
  userId: z.string().min(1, 'Ідентифікатор користувача обовʼязковий'),
})

export const banUserSchema = z
  .object({
    duration: z.enum(['week', 'forever', 'custom']),
    until: z.iso.datetime().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.duration !== 'custom') return
    if (!value.until || new Date(value.until).getTime() <= Date.now()) {
      ctx.addIssue({
        code: 'custom',
        path: ['until'],
        message: 'Вкажіть дату й час у майбутньому',
      })
    }
  })

const templateGroupUrlSchema = z
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
  .transform((value) => value.startsWith('@') ? `https://t.me/${value.slice(1)}` : value)

export const eventTemplateSchema = z
  .object({
    title: z.string().trim().min(1, 'Назва обовʼязкова'),
    description: z.string().trim().default(''),
    weekday: z.number().int().min(0).max(6),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Некоректний час'),
    location: z.string().trim().min(1, 'Місце обовʼязкове'),
    isOnline: z.boolean().default(false),
    maxParticipants: z.number().int().positive(),
    groupUrl: templateGroupUrlSchema.optional(),
    dormitoryId: z.uuid('Некоректний гуртожиток').optional(),
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

export const eventTemplateIdParamSchema = z.object({
  templateId: z.uuid('Некоректний шаблон'),
})
