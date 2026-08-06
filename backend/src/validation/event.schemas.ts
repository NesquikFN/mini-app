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

export const createEventSchema = z.object({
  title: z.string().trim().min(1, 'Назва обовʼязкова'),
  description: z.string().trim().default(''),
  date: dateSchema,
  time: timeSchema,
  location: z.string().trim().min(1, 'Місце обовʼязкове'),
  maxParticipants: z
    .number('Максимальна кількість учасників має бути числом')
    .int('Має бути цілим числом')
    .positive('Має бути більше 0'),
})

export type CreateEventInput = z.infer<typeof createEventSchema>

export const eventIdParamSchema = z.object({
  id: z.string().min(1, 'Ідентифікатор події обовʼязковий'),
})
