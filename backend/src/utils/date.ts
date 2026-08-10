import { addDaysToISODate, kyivNow } from './kyivTime'

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

/**
 * «Сьогодні» завжди за київським часом, а не за таймзоною процесу.
 * Контейнер на Railway живе в UTC, тож між 00:00 і 03:00 за Києвом
 * локальна дата хоста ще вчорашня — і валідація «дата не в минулому»
 * розходилась би з архівацією події, яка рахується за Києвом.
 */
export function todayISODate(): string {
  return kyivNow().date
}

/** `days` днів від київського «сьогодні», у тому ж форматі YYYY-MM-DD. */
export function daysFromTodayISODate(days: number): string {
  return addDaysToISODate(todayISODate(), days)
}

export function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

export function isPastDate(value: string): boolean {
  return value < todayISODate()
}
