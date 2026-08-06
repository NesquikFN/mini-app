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
  // Порожній за замовчуванням: бот можна створити пізніше (BotFather), а до
  // того локальна розробка йде через DEV_AUTH. Реальний Telegram-логін без
  // токена коректно впаде з зрозумілою помилкою (див. auth.service.ts).
  BOT_TOKEN: z.string().optional().default(''),
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET має бути щонайменше 16 символів (openssl rand -hex 32)'),
  // Дозволяє POST /api/auth/telegram видавати сесію без реальної Telegram
  // initData — лише для локальної розробки. Заблоковано на рівні коду для
  // NODE_ENV=production незалежно від значення цієї змінної.
  // (z.coerce.boolean() навмисно не використовується: Boolean("false") === true)
  DEV_AUTH: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((value) => value === 'true'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Некоректні змінні середовища:', z.treeifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
