import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL обовʼязковий (Postgres connection string)'),
  // Диск, куди зберігаються завантажені зображення (подій/шаблонів) —
  // на Railway це шлях монтування Volume, локально звичайна папка.
  UPLOADS_DIR: z.string().default('uploads'),
  // Публічний origin цього ж backend-сервісу, потрібен лише щоб
  // побудувати повний URL для збережених зображень (${PUBLIC_URL}/uploads/...).
  PUBLIC_URL: z.url().default('http://localhost:3000'),
  // Порожній за замовчуванням: бот можна створити пізніше (BotFather), а до
  // того локальна розробка йде через DEV_AUTH. Реальний Telegram-логін без
  // токена коректно впаде з зрозумілою помилкою (див. auth.service.ts).
  BOT_TOKEN: z.string().optional().default(''),
  // Short name from BotFather → Bot Settings → Mini Apps. When present,
  // event buttons use the Direct Mini App form:
  // t.me/<bot>/<short_name>?startapp=event_<uuid>. Leave empty only when
  // the bot has a Main Mini App configured in BotFather.
  TELEGRAM_APP_SHORT_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_]*$/, 'TELEGRAM_APP_SHORT_NAME має містити лише літери, цифри та _')
    .optional()
    .default(''),
  // Перевіряє заголовок X-Telegram-Bot-Api-Secret-Token на POST
  // /api/telegram/webhook — без нього будь-хто в інтернеті міг би слати
  // нам підроблені "оновлення". Задається при реєстрації вебхука
  // (setWebhook ...&secret_token=...) і має збігатися з цим значенням.
  TELEGRAM_WEBHOOK_SECRET: z.string().optional().default(''),
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
