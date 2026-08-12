import { z } from 'zod'
import { uuidParam } from './common.schemas'

const pollOptionText = z
  .string('Варіант має бути текстом')
  .trim()
  .min(1, 'Варіант не може бути порожнім')
  .max(120, 'Максимум 120 символів')

/** 2–8 непорожніх, попарно різних (без урахування регістру й зайвих
 * пробілів) варіантів — межі продубльовані в quick-plans-подібному дусі
 * з БД-обмеженнями немає сенсу (варіанти — окремі рядки, не одне поле),
 * тож єдине джерело правди для кількості й унікальності — тут. */
const pollOptionsSchema = z
  .array(pollOptionText)
  .min(2, 'Мінімум 2 варіанти')
  .max(8, 'Максимум 8 варіантів')
  .refine(
    (options) => new Set(options.map((option) => option.toLowerCase())).size === options.length,
    { message: 'Варіанти не повинні повторюватись' },
  )

/** endsAt — необов'язковий, але якщо вказаний, має лежати в майбутньому
 * (той самий підхід superRefine, що й у banUserSchema). */
const pollFieldsSchema = z.object({
  question: z
    .string('Вкажіть запитання')
    .trim()
    .min(1, 'Вкажіть запитання')
    .max(240, 'Максимум 240 символів'),
  options: pollOptionsSchema,
  endsAt: z.iso.datetime().nullable().optional(),
})

export const createPollSchema = pollFieldsSchema.superRefine((value, ctx) => {
  if (!value.endsAt) return
  if (new Date(value.endsAt).getTime() <= Date.now()) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Дата завершення має бути в майбутньому' })
  }
})

export const updatePollSchema = createPollSchema

export type CreatePollInput = z.infer<typeof pollFieldsSchema>

export const pollIdParamSchema = z.object({
  id: uuidParam('Некоректний ідентифікатор опитування'),
})

export const voteSchema = z.object({
  optionId: uuidParam('Некоректний варіант відповіді'),
})

export const pollAudienceSchema = z.enum(['all', 'subscribers'], { message: 'Некоректна аудиторія' })

export const audienceQuerySchema = z.object({
  audience: pollAudienceSchema,
})

export const pollBroadcastSchema = z.object({
  audience: pollAudienceSchema,
  // literal(true): фронтенд зобов'язаний явно передати confirm: true після
  // showing confirmation modal — саме тіло запиту й є доказом підтвердження.
  confirm: z.literal(true, { message: 'Підтвердіть розсилку' }),
  // Повторний запуск розсилки для опитування, яке вже розсилалось,
  // вимагає ще одного явного підтвердження — див. polls.service.broadcastPoll.
  resend: z.boolean().optional().default(false),
})
