import { z } from 'zod'

// Zod's built-in .uuid() enforces RFC 4122 version/variant nibbles, which
// the seeded dormitories (deterministic ids like
// 00000000-0000-0000-0000-000000000101 — see
// database/migrations/0004_dormitories.sql) don't have. A plain
// 8-4-4-4-12 hex-shape check is all that's actually needed here: the
// real existence check happens against the dormitories table in
// users.service.ts, not in this format validation.
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  id: z.string().min(1, 'Ідентифікатор користувача обовʼязковий'),
})

export type UpdateMeInput = z.infer<typeof updateMeSchema>
