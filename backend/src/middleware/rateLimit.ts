import type { Request, Response, NextFunction } from 'express'
import { rateLimit, ipKeyGenerator, type Options } from 'express-rate-limit'
import { AppError } from '../utils/AppError'

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

export const createEventRateLimiter = buildLimiter({
  windowMs: HOUR,
  limit: RATE_LIMITS.createEventPerHour,
})

export const templateLaunchRateLimiter = buildLimiter({
  windowMs: HOUR,
  limit: RATE_LIMITS.templateLaunchPerHour,
})

export const imageUploadRateLimiter = buildLimiter({
  windowMs: HOUR,
  limit: RATE_LIMITS.imageUploadPerHour,
})

export const telegramProbeRateLimiter = buildLimiter({
  windowMs: HOUR,
  limit: RATE_LIMITS.telegramProbePerHour,
})

export const createQuickPlanRateLimiter = buildLimiter({
  windowMs: HOUR,
  limit: RATE_LIMITS.createQuickPlanPerHour,
})

export const quickPlanJoinRateLimiter = buildLimiter({
  windowMs: HOUR,
  limit: RATE_LIMITS.quickPlanJoinPerHour,
})
