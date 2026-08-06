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
