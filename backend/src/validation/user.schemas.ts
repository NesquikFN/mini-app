import { z } from 'zod'

// Zod's built-in .uuid() enforces RFC 4122 version/variant nibbles, which
// the seeded dormitories (deterministic ids like
// 00000000-0000-0000-0000-000000000101 — see
// database/migrations/0004_dormitories.sql) don't have. A plain
// 8-4-4-4-12 hex-shape check is all that's actually needed here: the
// real existence check happens against the dormitories table in
// users.service.ts, not in this format validation.
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const updateMeSchema = z.object({
  dormitoryId: z
    .string('Гуртожиток обовʼязковий')
    .regex(UUID_SHAPE, 'Некоректний ідентифікатор гуртожитку'),
})

export const publicUserIdParamSchema = z.object({
  id: z.string().min(1, 'Ідентифікатор користувача обовʼязковий'),
})

export type UpdateMeInput = z.infer<typeof updateMeSchema>
