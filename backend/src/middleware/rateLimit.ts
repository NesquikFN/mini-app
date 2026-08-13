import type { Request, Response, NextFunction } from 'express'
import { rateLimit, ipKeyGenerator, MemoryStore, type Options, type Store } from 'express-rate-limit'
import { AppError } from '../utils/AppError'
import { env } from '../config/env'
import { PostgresRateLimitStore } from './rateLimitStore'

/**
 * Ліміти запитів. Дві осі навмисно розділені:
 *
 *  - за IP — лише грубий антифлуд для неавтентифікованого трафіку. Він
 *    свідомо щедрий: мешканці одного гуртожитку цілком можуть сидіти за
 *    спільним NAT, і сотня сусідів не повинна вимикати застосунок одне
 *    одному.
 *  - за users.id — справжні продуктові ліміти для вже автентифікованих
 *    дій. Ключ від сесії, тож спільний IP нікого не зачіпає, а зміна IP
 *    не дає обійти ліміт.
 *
 * Усі ліміти віддають помилку в тому самому форматі, що й решта API
 * (через AppError → errorHandler), і не виставляють RateLimit-*
 * заголовків, щоб не публікувати саму конфігурацію.
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

export const RATE_LIMITS = {
  /** Грубий антифлуд по IP на весь /api (включно з неавтентифікованим). */
  globalPerIpPerMinute: 600,
  /** Основний ліміт автентифікованого користувача. */
  perUserPerMinute: 240,
  /** POST /api/auth/telegram — до автентифікації, тому лише по IP. */
  // Авторизація ще не має users.id, тому рахується за IP. Запас у 120
  // потрібен для спільного Wi-Fi гуртожитку: одночасний вхід багатьох
  // мешканців не повинен блокувати всю мережу.
  authPer15Minutes: 120,
  /** Створення події (кожна розсилає DM усім підписникам). */
  createEventPerHour: 10,
  /** Запуск події з шаблону — той самий ефект розсилки. */
  templateLaunchPerHour: 10,
  /** Завантаження обкладинок (диск на Railway Volume). */
  imageUploadPerHour: 20,
  /** Створення швидкого плану. Стеля активних планів (3) і так обмежує
   * кількість — цей ліміт додатково стримує «створив → видалив → створив». */
  createQuickPlanPerHour: 15,
  /** Відгук/скасування відгуку на швидкий план: кожен join шле DM автору,
   * тож join/leave по колу не повинні перетворитись на спам. */
  quickPlanJoinPerHour: 60,
  /** Адмінські ендпоїнти, що самі ходять у Telegram Bot API. */
  telegramProbePerHour: 60,
  /** Поширення події: кожне натискання рендерить картку (sharp) і може
   * піти в Bot API, тож повторні тапи не повинні молотити ні диск, ні
   * Telegram. */
  eventSharePerHour: 40,
  /** Розсилка опитування в особисті повідомлення — потенційно сотні DM
   * за один виклик, тож суворіший за будь-який інший адмінський ліміт:
   * випадковий подвійний клік не повинен запустити другу хвилю
   * повідомлень (додатково до гейта POLL_ALREADY_BROADCAST). */
  pollBroadcastPerHour: 3,
  /** Оцінка події: PUT спрацьовує і на перший голос, і на зміну — щедрий
   * ліміт (людина не оцінює десятки подій щогодини), лише проти
   * автоматизованого спаму. */
  submitEventRatingPerHour: 30,
} as const

/** Стабільний ключ: id користувача для автентифікованих запитів, інакше
 * IP (через ipKeyGenerator — він нормалізує IPv6 у /64-підмережу, тож
 * один клієнт не отримає нескінченно багато відер). */
function userOrIpKey(req: Request): string {
  const userId = req.user?.id
  if (userId) return `user:${userId}`
  return `ip:${ipKeyGenerator(req.ip ?? '')}`
}

function rejectOverLimit(_req: Request, _res: Response, next: NextFunction): void {
  next(
    new AppError(
      429,
      'RATE_LIMITED',
      'Забагато запитів. Зачекайте трохи і спробуйте ще раз.',
    ),
  )
}

/**
 * Сховище лічильників для лімітів, які мають пережити рестарт процесу.
 *
 * Годинні продуктові ліміти в MemoryStore були фікцією: будь-який деплой
 * чи перезапуск обнуляв їх усім одночасно, тож «10 подій на годину»
 * трималося рівно до наступного релізу. Вони переїхали в Postgres
 * (rate_limit_hits, migrations/0029).
 *
 * Хвилинний антифлуд і auth свідомо лишаються в пам'яті: вікно коротке,
 * перезапуск ініціює не клієнт (обійти ліміт через нього не можна), а
 * похід у БД на КОЖЕН запит до /api коштував би більше, ніж дає.
 *
 * У тестах store завжди в пам'яті — security-тести навмисно ганяють
 * справжні лімітери зі справжніми значеннями, а тестовий DATABASE_URL
 * вказує в мертвий порт (див. __security__/testEnv.ts). Ліміти, ключі й
 * саме middleware при цьому ті самі, що в проді; відрізняється лише те,
 * де лежить лічильник.
 */
function persistentStore(name: string): Store {
  return env.NODE_ENV === 'test' ? new MemoryStore() : new PostgresRateLimitStore(name)
}

function buildLimiter(options: Partial<Options>) {
  return rateLimit({
    // Конфігурацію лімітера назовні не публікуємо.
    standardHeaders: false,
    legacyHeaders: false,
    handler: rejectOverLimit,
    keyGenerator: userOrIpKey,
    ...options,
  })
}

/**
 * Лімітер із лічильником у Postgres.
 *
 * passOnStoreError: якщо запит до rate_limit_hits упав, запит
 * пропускається без урахування ліміту (помилка при цьому потрапляє в лог
 * — express-rate-limit логує її сам). Альтернатива — 500 на створенні
 * події через недоступну БД, що гірше й безглуздо: усі ці ендпоїнти й
 * так одразу після лімітера йдуть у ту саму базу, тож справжній збій БД
 * зупинить запит наступним кроком, з нормальною помилкою.
 *
 * Практично це важливо рівно в одному випадку: якщо migrations/0029 ще
 * не застосована, застосунок працює як раніше (ліміт не рахується), а не
 * падає на кожному POST /api/events.
 */
function buildPersistentLimiter(name: string, options: Partial<Options>) {
  return buildLimiter({ ...options, store: persistentStore(name), passOnStoreError: true })
}

/** Весь /api, за IP. Стоїть до автентифікації, тому ключ завжди IP. */
export const globalRateLimiter = buildLimiter({
  windowMs: MINUTE,
  limit: RATE_LIMITS.globalPerIpPerMinute,
  keyGenerator: (req: Request) => `ip:${ipKeyGenerator(req.ip ?? '')}`,
})

/** Ставиться одразу після requireTelegramAuth — ключ завжди users.id. */
export const perUserRateLimiter = buildLimiter({
  windowMs: MINUTE,
  limit: RATE_LIMITS.perUserPerMinute,
})

export const authRateLimiter = buildLimiter({
  windowMs: 15 * MINUTE,
  limit: RATE_LIMITS.authPer15Minutes,
  keyGenerator: (req: Request) => `ip:${ipKeyGenerator(req.ip ?? '')}`,
})

export const createEventRateLimiter = buildPersistentLimiter('create-event', {
  windowMs: HOUR,
  limit: RATE_LIMITS.createEventPerHour,
})

export const templateLaunchRateLimiter = buildPersistentLimiter('template-launch', {
  windowMs: HOUR,
  limit: RATE_LIMITS.templateLaunchPerHour,
})

export const imageUploadRateLimiter = buildPersistentLimiter('image-upload', {
  windowMs: HOUR,
  limit: RATE_LIMITS.imageUploadPerHour,
})

export const telegramProbeRateLimiter = buildPersistentLimiter('telegram-probe', {
  windowMs: HOUR,
  limit: RATE_LIMITS.telegramProbePerHour,
})

export const eventShareRateLimiter = buildPersistentLimiter('event-share', {
  windowMs: HOUR,
  limit: RATE_LIMITS.eventSharePerHour,
})

export const createQuickPlanRateLimiter = buildPersistentLimiter('quick-plan-create', {
  windowMs: HOUR,
  limit: RATE_LIMITS.createQuickPlanPerHour,
})

export const quickPlanJoinRateLimiter = buildPersistentLimiter('quick-plan-join', {
  windowMs: HOUR,
  limit: RATE_LIMITS.quickPlanJoinPerHour,
})

export const pollBroadcastRateLimiter = buildPersistentLimiter('poll-broadcast', {
  windowMs: HOUR,
  limit: RATE_LIMITS.pollBroadcastPerHour,
})

export const submitEventRatingRateLimiter = buildPersistentLimiter('submit-event-rating', {
  windowMs: HOUR,
  limit: RATE_LIMITS.submitEventRatingPerHour,
})
