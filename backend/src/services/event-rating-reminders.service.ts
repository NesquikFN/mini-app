import { eventRatingsRepository } from '../repositories/event-ratings.repository'
import {
  NOTIFICATION_CONCURRENCY,
  isTransientTelegramFailure,
  sendEventRatingRequest,
} from './telegram-notifications.service'
import { kyivTimestamp } from '../utils/kyivTime'
import { mapWithConcurrency } from '../utils/concurrency'

/** Скільки хвилин після завершення події чекаємо, перш ніж запропонувати
 * оцінити її — надто рано, і людина ще не встигла піти з події. */
const WINDOW_START_MINUTES_AFTER_END = 30
/** Верхня межа вікна — та сама логіка, що й у event-reminders.service.ts:
 * подія, яка завершилась понад годину тому, вже не отримає цього
 * нагадування навіть після рестарту процесу (rating_reminder_sent_at
 * лишиться порожнім, але findDueForRatingRequest її більше не поверне). */
const WINDOW_END_MINUTES_AFTER_END = 60
const POLL_INTERVAL_MS = 5 * 60 * 1000

/**
 * Дзеркальне до event-reminders.service.ts: знаходить події, що
 * завершились 30–60 хв тому й ще не отримали пропозицію оцінити, і шле
 * її кожному учаснику, крім організатора й тих, хто вже оцінив
 * (getRatingRequestTelegramIds відсіює обох у SQL). Один раз на подію —
 * дедуплікація через events.rating_reminder_sent_at, той самий шаблон,
 * що й reminder_sent_at.
 */
export async function sendDueRatingRequests(): Promise<void> {
  // "30-60 хв тому" = вікно [now - 60хв, now - 30хв] за годинником;
  // findDueForRatingRequest порівнює (date+time) з межами вікна.
  const windowStartTs = kyivTimestamp(-WINDOW_END_MINUTES_AFTER_END)
  const windowEndTs = kyivTimestamp(-WINDOW_START_MINUTES_AFTER_END)
  const dueEvents = await eventRatingsRepository.findDueForRatingRequest(windowStartTs, windowEndTs)

  for (const event of dueEvents) {
    const requiredRole = event.is_vip_only ? 'vip' : event.is_gpu_only ? 'gpu' : undefined
    const telegramIds = await eventRatingsRepository.getRatingRequestTelegramIds(
      event.id,
      event.creator_id,
      requiredRole,
    )

    let delivered = 0
    let transientFailures = 0
    await mapWithConcurrency(telegramIds, NOTIFICATION_CONCURRENCY, async (telegramId) => {
      try {
        await sendEventRatingRequest(String(telegramId), event)
        delivered += 1
      } catch (error) {
        if (isTransientTelegramFailure(error)) transientFailures += 1
        console.error(
          `Не вдалося надіслати запит оцінити подію ${event.id} користувачу ${telegramId}:`,
          error,
        )
      }
    })

    // Той самий принцип, що й у event-reminders.service.ts: якщо взагалі
    // нікому не дійшло і причина тимчасова, лишаємо прапорець порожнім —
    // наступний полл спробує ще раз, поки подія не випаде з 30–60-хв вікна.
    if (delivered === 0 && transientFailures > 0 && telegramIds.length > 0) continue

    await eventRatingsRepository.markRatingReminderSent(event.id)
  }
}

export function startEventRatingReminderScheduler(): void {
  sendDueRatingRequests().catch((error) =>
    console.error('Початкова перевірка запитів оцінити подію не вдалася:', error),
  )
  setInterval(() => {
    sendDueRatingRequests().catch((error) =>
      console.error('Перевірка запитів оцінити подію не вдалася:', error),
    )
  }, POLL_INTERVAL_MS)
}
