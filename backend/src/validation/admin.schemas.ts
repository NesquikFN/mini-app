import { z } from 'zod'
import { uuidParam } from './common.schemas'

export const notificationSettingsSchema = z.object({
  chatId: z.string().regex(/^-?\d+$/, 'Некоректний Telegram chat_id').nullable(),
  chatTitle: z.string().trim().min(1).nullable(),
  threadId: z.string().regex(/^\d+$/, 'Некоректний ID гілки').nullable().optional(),
  threadTitle: z.string().trim().min(1).nullable().optional(),
}).refine((value) => (value.chatId === null) === (value.chatTitle === null), {
  message: 'Чат і його назва мають бути вказані разом',
}).refine((value) => ((value.threadId ?? null) === null) === ((value.threadTitle ?? null) === null), {
  message: 'Гілка і її назва мають бути вказані разом',
})

export const socialLinksSchema = z.object({
  discordUrl: z.union([z.literal(''), z.url('Некоректне посилання')]).optional(),
  telegramUrl: z.union([z.literal(''), z.url('Некоректне посилання')]).optional(),
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

export const notificationLogQuerySchema = paginationQuerySchema

export const registrationsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  search: z.string().trim().optional(),
})

export const rejectRegistrationSchema = z.object({
  reason: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(500, 'Причина має містити не більше 500 символів').optional(),
  ),
})

export const userIdParamSchema = z.object({
  id: uuidParam('Некоректний ідентифікатор користувача'),
})

export const addAdminSchema = z.object({
  // Telegram ID лишається number (у БД bigint, читається через Number) —
  // верхня межа на рівні MAX_SAFE_INTEGER лише щоб не приймати значення,
  // яке вже втратило точність під час JSON.parse.
  telegramId: z
    .number('Telegram ID має бути числом')
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER, 'Некоректний Telegram ID'),
})

export const adminUserIdParamSchema = z.object({
  userId: uuidParam('Некоректний ідентифікатор користувача'),
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

