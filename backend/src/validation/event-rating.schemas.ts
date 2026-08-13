import { z } from 'zod'
import { uuidParam } from './common.schemas'
import { EVENT_RATING_TAGS } from '../types/eventRating'

const tagSchema = z.enum(EVENT_RATING_TAGS, { message: 'Невідома позначка' })

/** До 8 позначок теоретично не потрібно (лише 5 існує), але межа й так
 * випливає з enum — .max тут лише проти надто довгого масиву в тілі
 * запиту, ще до того, як Zod почне перевіряти кожен елемент. */
const tagsSchema = z
  .array(tagSchema)
  .max(EVENT_RATING_TAGS.length, 'Забагато позначок')
  .refine((tags) => new Set(tags).size === tags.length, {
    message: 'Позначки не повинні повторюватись',
  })
  .optional()
  .default([])

export const submitEventRatingSchema = z.object({
  rating: z
    .number('Оцінка має бути числом')
    .int('Оцінка має бути цілим числом')
    .min(1, 'Мінімальна оцінка — 1')
    .max(5, 'Максимальна оцінка — 5'),
  tags: tagsSchema,
})

export type SubmitEventRatingInput = z.infer<typeof submitEventRatingSchema>

export const eventRatingIdParamSchema = z.object({
  id: uuidParam('Некоректний ідентифікатор оцінки'),
})
