import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SUPABASE_URL: z.url('SUPABASE_URL має бути коректним URL проєкту Supabase'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY обовʼязковий (Supabase → Settings → API)'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Некоректні змінні середовища:', z.treeifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
