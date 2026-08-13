/** Українська множина має три форми (1, 2-4, 5+/11-14) — на відміну від
 * англійської чи російської логіки "просто додати -s". `few` — форма для
 * 2-4 (крім 12-14), `many` — для 5+, 11-14 і 0. */
function pluralizeUk(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

export function pluralizeEvents(count: number): string {
  return pluralizeUk(count, 'подія', 'події', 'подій')
}

export function pluralizeRatings(count: number): string {
  return pluralizeUk(count, 'оцінка', 'оцінки', 'оцінок')
}
