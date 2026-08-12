import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit'
import { query } from '../config/db'

/**
 * Store для express-rate-limit поверх Postgres (таблиця rate_limit_hits,
 * migrations/0029). Потрібен там, де лічильник має пережити рестарт
 * процесу: MemoryStore живе в пам'яті, тож будь-який деплой знімав
 * годинні ліміти з усіх користувачів одночасно.
 *
 * Вікно рахується «ковзним від першого запиту», рівно як у MemoryStore:
 * перший запит ставить expires_at = now() + windowMs, наступні лише
 * збільшують лічильник, а після закінчення вікна той самий рядок
 * перевикористовується з hits = 1. Уся ця логіка — в одному
 * INSERT ... ON CONFLICT, тож паралельні запити одного користувача не
 * можуть загубити інкремент (на відміну від read-modify-write у двох
 * запитах).
 */

interface HitsRow {
  hits: number
  /** config/db.ts парсить timestamptz в ISO-рядок, не в Date. */
  expires_at: string
}

/** Прибирання рядків із закінченим вікном. Один таймер на процес, а не
 * на кожен лімітер: DELETE усе одно спільний для всієї таблиці. */
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000
let cleanupStarted = false

function startExpiredHitsCleanup(): void {
  if (cleanupStarted) return
  cleanupStarted = true

  const timer = setInterval(() => {
    query('delete from rate_limit_hits where expires_at <= now()').catch((error: unknown) =>
      console.error('Не вдалося прибрати застарілі лічильники лімітів:', error),
    )
  }, CLEANUP_INTERVAL_MS)
  // Прибирання не має тримати процес живим під час зупинки сервісу.
  timer.unref?.()
}

export class PostgresRateLimitStore implements Store {
  /** false — саме тому цей store і існує: лічильник спільний для всіх
   * інстансів процесу, а не локальний. */
  readonly localKeys = false

  /** Усі лімітери ділять одну таблицю, а keyGenerator повертає той самий
   * `user:<uuid>` для кожного з них — без префікса створення події
   * з'їдало б квоту завантаження обкладинок. */
  readonly prefix: string

  private windowSeconds = 0

  constructor(name: string) {
    this.prefix = `${name}:`
  }

  init(options: Options): void {
    this.windowSeconds = options.windowMs / 1000
    startExpiredHitsCleanup()
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const { rows } = await query<HitsRow>(
      `insert into rate_limit_hits (key, hits, expires_at)
       values ($1, 1, now() + make_interval(secs => $2::double precision))
       on conflict (key) do update set
         hits = case when rate_limit_hits.expires_at <= now() then 1 else rate_limit_hits.hits + 1 end,
         expires_at = case when rate_limit_hits.expires_at <= now()
                           then excluded.expires_at
                           else rate_limit_hits.expires_at end
       returning hits, expires_at`,
      [this.prefix + key, this.windowSeconds],
    )
    return toInfo(rows[0])
  }

  async decrement(key: string): Promise<void> {
    // Лише в межах чинного вікна: віднімати від уже протухлого рядка
    // означало б зіпсувати лічильник наступного вікна.
    await query(
      `update rate_limit_hits set hits = greatest(hits - 1, 0)
       where key = $1 and expires_at > now()`,
      [this.prefix + key],
    )
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const { rows } = await query<HitsRow>(
      'select hits, expires_at from rate_limit_hits where key = $1 and expires_at > now()',
      [this.prefix + key],
    )
    return rows[0] ? toInfo(rows[0]) : undefined
  }

  async resetKey(key: string): Promise<void> {
    await query('delete from rate_limit_hits where key = $1', [this.prefix + key])
  }

  /** Тільки власні ключі: скидання одного лімітера не повинно зачіпати
   * лічильники решти. */
  async resetAll(): Promise<void> {
    await query('delete from rate_limit_hits where key like $1', [`${this.prefix}%`])
  }
}

function toInfo(row: HitsRow): ClientRateLimitInfo {
  return { totalHits: row.hits, resetTime: new Date(row.expires_at) }
}
