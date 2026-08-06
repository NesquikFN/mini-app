export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatEventDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Postgres повертає HH:MM:SS, у UI потрібен лише HH:MM. */
export function formatEventTime(time: string): string {
  return time.slice(0, 5)
}

export function todayISODate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
