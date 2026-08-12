/**
 * Локальний стан пропозиції «додати DormHub на головний екран».
 *
 * Свідомо localStorage, а не sessionStorage (як у services/session.ts):
 * лічильник відвідувань має пережити закриття Mini App, інакше третього
 * відвідування не станеться ніколи. Нічого приватного тут не лежить —
 * лише лічильник, три часові мітки й прапорець.
 *
 * Ключі версіоновані (`_v1`): якщо логіка показу колись зміниться,
 * достатньо підняти версію, і старі значення просто перестануть
 * читатися замість того, щоб зіпсувати нову поведінку.
 *
 * Будь-яке читання толерантне до сміття: у Telegram WebView localStorage
 * буває недоступний (приватний режим, вимкнені cookies), а значення
 * може виявитись підробленим руками. Жодна помилка звідси не має
 * доходити до HomePage.
 */

const VISITS_KEY = 'dormhub_home_visits_v1'
const LAST_VISIT_KEY = 'dormhub_home_last_visit_v1'
const DISMISSED_KEY = 'dormhub_home_prompt_dismissed_v1'
const ADDED_KEY = 'dormhub_home_screen_added_v1'
/** Не з початкового списку ключів: потрібен лише для статусу `unknown`,
 * де Telegram не може сказати, чи ярлик уже є, тож показ доводиться
 * розріджувати самостійно. */
const LAST_SHOWN_KEY = 'dormhub_home_prompt_last_shown_v1'

/** Скільки окремих відвідувань має накопичитись до першого показу. */
export const VISITS_BEFORE_PROMPT = 3

/** Два відкриття ближче ніж за 6 годин — це одне відвідування. Заразом
 * закриває і reload сторінки: він ніколи не встигає стати новим
 * відвідуванням. */
export const VISIT_THROTTLE_MS = 6 * 60 * 60 * 1000

/** «Не зараз» ховає банер на 30 днів. */
export const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000

/** Пауза між показами, коли статус `unknown`. */
export const UNKNOWN_STATUS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    // Приватний режим / вимкнене сховище — поводимось як «нічого не збережено».
    return null
  }
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Записати не вдалося — банер просто з'явиться ще раз наступного разу.
  }
}

/** Скінченне невід'ємне число або undefined. Порожній рядок, "abc",
 * "NaN", "-5" та "Infinity" однаково вважаються відсутнім значенням. */
function readTimestamp(key: string): number | undefined {
  const raw = readRaw(key)
  if (raw === null || raw.trim() === '') return undefined
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return undefined
  return value
}

function readCount(key: string): number {
  const value = readTimestamp(key)
  if (value === undefined) return 0
  return Math.floor(value)
}

/**
 * Зараховує відвідування, якщо від попереднього минуло щонайменше
 * VISIT_THROTTLE_MS, і повертає підсумкову кількість.
 *
 * Мітка з майбутнього (переведений годинник, інший часовий пояс) не
 * повинна заблокувати лічильник назавжди — такий випадок трактуємо як
 * зіпсоване значення й рахуємо відвідування.
 */
export function registerVisit(now: number = Date.now()): number {
  const visits = readCount(VISITS_KEY)
  const lastVisit = readTimestamp(LAST_VISIT_KEY)
  const withinThrottle =
    lastVisit !== undefined && lastVisit <= now && now - lastVisit < VISIT_THROTTLE_MS

  if (withinThrottle) return visits

  const next = visits + 1
  writeRaw(VISITS_KEY, String(next))
  writeRaw(LAST_VISIT_KEY, String(now))
  return next
}

export function isDismissed(now: number = Date.now()): boolean {
  const dismissedAt = readTimestamp(DISMISSED_KEY)
  if (dismissedAt === undefined) return false
  // Мітка з майбутнього — вважаємо відмову чинною, інакше зіпсоване
  // значення показувало б банер тому, хто вже сказав «не зараз».
  if (dismissedAt > now) return true
  return now - dismissedAt < DISMISS_DURATION_MS
}

export function rememberDismissed(now: number = Date.now()): void {
  writeRaw(DISMISSED_KEY, String(now))
}

export function isAlreadyAdded(): boolean {
  return readRaw(ADDED_KEY) === '1'
}

export function rememberAdded(): void {
  writeRaw(ADDED_KEY, '1')
}

/** Чи минула пауза між показами для статусу `unknown`. */
export function isUnknownCooldownOver(now: number = Date.now()): boolean {
  const lastShown = readTimestamp(LAST_SHOWN_KEY)
  if (lastShown === undefined) return true
  if (lastShown > now) return false
  return now - lastShown >= UNKNOWN_STATUS_COOLDOWN_MS
}

export function rememberShown(now: number = Date.now()): void {
  writeRaw(LAST_SHOWN_KEY, String(now))
}
