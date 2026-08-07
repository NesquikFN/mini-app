import { z } from 'zod'

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
