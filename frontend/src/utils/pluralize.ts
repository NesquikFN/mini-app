/** Українська множина має три форми (1, 2-4, 5+/11-14) — на відміну від
 * англійської чи російської логіки "просто додати -s". */
export function pluralizeEvents(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return 'подія'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'події'
  return 'подій'
}
