import { z } from 'zod'
import { UUID_SHAPE, uuidParam } from './common.schemas'

// UUID_SHAPE живе у common.schemas.ts — той самий валідатор, що й для
// решти ідентифікаторів. Реальна перевірка існування гуртожитку
// відбувається проти таблиці dormitories в users.service.ts, не тут.

function emptyStringToNull(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? null : value
}

const nicknameSchema = z.preprocess(
  emptyStringToNull,
  z.string().trim().min(2, 'Нікнейм має містити щонайменше 2 символи').max(40).nullable(),
)

const bioSchema = z.preprocess(
  emptyStringToNull,
  z.string().trim().max(500, 'Опис має містити не більше 500 символів').nullable(),
)

const instagramSchema = z.preprocess(
  emptyStringToNull,
  z.union([
    z.null(),
    z.string().trim().max(100).transform((value) => {
      const withoutAt = value.replace(/^@/, '')
      const urlMatch = withoutAt.match(
        /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?$/i,
      )
      return urlMatch?.[1] ?? withoutAt
    }).pipe(
      z.string()
        .min(1, 'Вкажіть Instagram')
        .max(30, 'Instagram username має містити не більше 30 символів')
        .regex(/^[A-Za-z0-9._]+$/, 'Некоректний Instagram username'),
    ),
  ]),
)

export const updateMeSchema = z
  .object({
    dormitoryId: z.string().regex(UUID_SHAPE, 'Некоректний ідентифікатор гуртожитку').optional(),
    notifyNewEvents: z.boolean().optional(),
    nickname: nicknameSchema.optional(),
    instagram: instagramSchema.optional(),
    bio: bioSchema.optional(),
    age: z.number().int().min(13, 'Мінімальний вік — 13 років').max(120).nullable().optional(),
  })
  .refine(
    (value) => Object.values(value).some((item) => item !== undefined),
    { message: 'Немає що оновлювати' },
  )

// Не приймає registrationStatus взагалі — навіть якщо клієнт його
// надішле, zod відкидає невідомі поля за замовчуванням, тож самостійно
// виставити собі 'approved' структурно неможливо.
export const submitRegistrationSchema = z.object({
  age: z
    .number('Вік має бути числом')
    .int('Вік має бути цілим числом')
    .min(13, 'Мінімальний вік — 13 років')
    .max(120, 'Максимальний вік — 120 років'),
  faculty: z
    .string('Вкажіть факультет')
    .trim()
    .min(2, 'Назва факультету має містити щонайменше 2 символи')
    .max(100, 'Назва факультету має містити не більше 100 символів'),
  instagram: instagramSchema.optional(),
  bio: bioSchema.optional(),
})

export type SubmitRegistrationInput = z.infer<typeof submitRegistrationSchema>

export const publicUserIdParamSchema = z.object({
  id: uuidParam('Некоректний ідентифікатор користувача'),
})

export type UpdateMeInput = z.infer<typeof updateMeSchema>
