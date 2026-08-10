/**
 * Side-effect module: МАЄ бути імпортований ПЕРШИМ у кожному
 * security-тесті, до будь-якого імпорту, що тягне config/env.
 *
 * Навіщо: config/env робить `import 'dotenv/config'`, а backend/.env
 * розробника вказує на production-базу Railway. dotenv не перезаписує
 * вже наявні змінні, тож виставлені тут значення виграють — і жоден
 * тест фізично не може відкрити з'єднання з production. DATABASE_URL
 * навмисно вказує в порт 1 на localhost: якщо якийсь шлях коду все ж
 * спробує зробити запит, він одразу впаде з ECONNREFUSED, а не піде
 * кудись у реальну базу.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://dormhub_test:dormhub_test@127.0.0.1:1/dormhub_test'
process.env.JWT_SECRET = 'security-test-secret-not-used-anywhere-real'
process.env.BOT_TOKEN = 'security-test-bot-token'
process.env.TELEGRAM_WEBHOOK_SECRET = 'security-test-webhook-secret'
process.env.FRONTEND_URL = 'https://frontend.test'
process.env.PUBLIC_URL = 'https://backend.test'
process.env.DEV_AUTH = 'false'

/** Кожен запуск отримує власну теку — тести завантаження пишуть реальні
 * файли, і вони не повинні ні перетинатись, ні лишатись у репозиторії. */
export const TEST_UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'dormhub-uploads-'))
process.env.UPLOADS_DIR = TEST_UPLOADS_DIR
