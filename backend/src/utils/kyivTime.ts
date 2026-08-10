/**
 * All event date/time values are stored as naive `date`/`time` columns
 * (see database/schema.sql) — nobody in this app ever picks a timezone,
 * they just mean "Kyiv wall-clock time" implicitly. The Node process
 * itself may run in any timezone (Railway containers default to UTC,
 * unlike a dev machine that might happen to be set to Europe/Kyiv), so
 * any "what time is it right now, relative to these naive values" check
 * must go through here rather than plain `new Date()` local-time
 * getters — otherwise the exact hour is wrong by whatever the
 * container's offset from Kyiv happens to be.
 */

const KYIV_TZ = 'Europe/Kyiv'

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

export interface KyivNow {
  /** YYYY-MM-DD, matching the `events.date` column format. */
  date: string
  /** HH:MM, matching the `events.time` column format (minute precision). */
  time: string
  /** 0 (Sunday) .. 6 (Saturday), same convention as JS Date#getDay(). */
  weekday: number
}

/** Current Kyiv wall-clock date/time/weekday, optionally offset by some
 * number of minutes from now (e.g. `kyivNow(30)` for "30 minutes from now"). */
export function kyivNow(offsetMinutes = 0): KyivNow {
  const instant = new Date(Date.now() + offsetMinutes * 60_000)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KYIV_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(instant)
  const get = (type: string) => parts.find((part) => part.type === type)!.value

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
    weekday: WEEKDAY_INDEX[get('weekday')],
  }
}

/** Naive `YYYY-MM-DDTHH:MM:00` timestamp for the given offset — safe to
 * bind as a Postgres `timestamp without time zone` parameter and compare
 * directly against `date + time` (no separate database-side tz math). */
export function kyivTimestamp(offsetMinutes = 0): string {
  const { date, time } = kyivNow(offsetMinutes)
  return `${date}T${time}:00`
}

/**
 * Чи настав уже момент `date`+`time` за київським «стінним» часом.
 * Єдине джерело правди для «дата в минулому / подія вже завершилась»:
 * і валідація при створенні події, і гейт архіву при вступі мають
 * відповідати однаково, інакше можна створити подію, до якої одразу
 * неможливо приєднатись. Порівняння лексикографічне — обидва боки в
 * фіксованому форматі YYYY-MM-DDTHH:MM.
 */
export function isKyivDateTimeInPast(date: string, time: string): boolean {
  const now = kyivNow()
  return `${date}T${time.slice(0, 5)}` < `${now.date}T${now.time}`
}

/** Adds `days` to an ISO date string, done entirely in UTC-anchored Date
 * arithmetic so it never depends on (and is never skewed by) the host's
 * own local timezone. */
export function addDaysToISODate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const utcDate = new Date(Date.UTC(year, month - 1, day + days))
  return `${utcDate.getUTCFullYear()}-${String(utcDate.getUTCMonth() + 1).padStart(2, '0')}-${String(utcDate.getUTCDate()).padStart(2, '0')}`
}
