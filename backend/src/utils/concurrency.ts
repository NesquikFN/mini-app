/**
 * Проганяє задачі пачками обмеженого розміру замість Promise.all по
 * всьому списку. Розсилка анонсу події раніше стартувала стільки
 * одночасних запитів до Telegram, скільки є підписників — це і впирається
 * в ліміти Bot API (після чого бот тимчасово перестає працювати для
 * всіх), і тримає стільки ж відкритих сокетів одночасно.
 *
 * Без зовнішньої залежності: черга з N воркерів, які тягнуть наступний
 * індекс, — цього достатньо, а поведінку легко перевірити тестом.
 */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return
  const limit = Math.max(1, Math.min(concurrency, items.length))

  let nextIndex = 0
  const runners = Array.from({ length: limit }, async () => {
    for (;;) {
      const index = nextIndex++
      if (index >= items.length) return
      await worker(items[index], index)
    }
  })

  await Promise.all(runners)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    // unref, щоб очікування ніколи не тримало процес живим під час
    // зупинки сервісу.
    setTimeout(resolve, ms).unref?.()
  })
}
