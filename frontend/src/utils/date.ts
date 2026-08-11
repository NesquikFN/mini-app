const UKRAINIAN_MONTHS = [
  'січня',
  'лютого',
  'березня',
  'квітня',
  'травня',
  'червня',
  'липня',
  'серпня',
  'вересня',
  'жовтня',
  'листопада',
  'грудня',
]

export function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function todayISODate(): string {
  return toISODate(new Date())
}

export function formatEventDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-').map(Number)
  return `${day} ${UKRAINIAN_MONTHS[month - 1]}`
}

/** Backend повертає час у форматі PostgreSQL `HH:MM:SS` — обрізаємо секунди для показу. */
export function formatEventTime(time: string): string {
  return time.slice(0, 5)
}

export function isSameDay(isoDate: string, compareDate: Date): boolean {
  return isoDate === toISODate(compareDate)
}

export function isWithinNextDays(isoDate: string, days: number): boolean {
  const start = new Date(`${todayISODate()}T00:00:00`)
  const end = addDays(start, days)
  const target = new Date(`${isoDate}T00:00:00`)
  return target >= start && target <= end
}

export function isPastDate(isoDate: string): boolean {
  const start = new Date(`${todayISODate()}T00:00:00`)
  const target = new Date(`${isoDate}T00:00:00`)
  return target < start
}

const KYIV_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Події зберігаються як київський локальний час без timezone. Тому
 * порівнюємо їх із поточним київським часом, незалежно від timezone
 * пристрою користувача. */
export function isEventPast(isoDate: string, time: string, now = new Date()): boolean {
  const parts = KYIV_DATE_TIME_FORMATTER.formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const current = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
  const eventDateTime = `${isoDate}T${time.slice(0, 5)}`
  return eventDateTime < current
}

/** Скільки лишилось до `expiresAt` (швидкі плани), у людському вигляді.
 * Хвилинна точність: план живе години, тож секунди лише смикали б цифру. */
export function formatTimeLeft(expiresAt: string, now = Date.now()): string {
  const minutesLeft = Math.floor((new Date(expiresAt).getTime() - now) / 60_000)
  if (minutesLeft <= 0) return 'Завершується'
  if (minutesLeft < 60) return `${minutesLeft} хв`

  const hours = Math.floor(minutesLeft / 60)
  const minutes = minutesLeft % 60
  return minutes === 0 ? `${hours} год` : `${hours} год ${minutes} хв`
}
