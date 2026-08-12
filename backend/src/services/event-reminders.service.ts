import { eventsRepository } from '../repositories/events.repository'
import {
  NOTIFICATION_CONCURRENCY,
  isTransientTelegramFailure,
  sendEventReminder,
} from './telegram-notifications.service'
import { kyivTimestamp } from '../utils/kyivTime'
import { mapWithConcurrency } from '../utils/concurrency'

const REMINDER_WINDOW_MINUTES = 30
const POLL_INTERVAL_MS = 5 * 60 * 1000

/**
 * Finds events starting within the next 30 minutes that haven't been
 * reminded yet and DMs every participant. Runs on a plain interval
 * (startEventReminderScheduler) rather than an external cron — this is
 * a single long-lived Railway process, no separate scheduler infra
 * exists or is needed. Polling every 5 minutes means a reminder lands
 * somewhere between 25 and 30 minutes before start, not exactly 30 —
 * fine for a courtesy nudge.
 */
export async function sendDueReminders(): Promise<void> {
  const nowTs = kyivTimestamp()
  const windowEndTs = kyivTimestamp(REMINDER_WINDOW_MINUTES)
  const dueEvents = await eventsRepository.findDueForReminder(nowTs, windowEndTs)

  for (const event of dueEvents) {
    const requiredRole = event.vipOnly ? 'vip' : event.gpuOnly ? 'gpu' : undefined
    const telegramIds = await eventsRepository.getParticipantTelegramIds(event.id, requiredRole)

    let delivered = 0
    let transientFailures = 0
    await mapWithConcurrency(telegramIds, NOTIFICATION_CONCURRENCY, async (telegramId) => {
      try {
        await sendEventReminder(String(telegramId), event)
        delivered += 1
      } catch (error) {
        if (isTransientTelegramFailure(error)) transientFailures += 1
        console.error(
          `Не вдалося надіслати нагадування про подію ${event.id} користувачу ${telegramId}:`,
          error,
        )
      }
    })

    // Не дійшло взагалі нікому, і причина тимчасова (429, 5xx, обрив
    // мережі) — лишаємо reminder_sent_at порожнім, щоб наступний полл
    // спробував ще раз. Продублювати нагадування це не може: його не
    // отримав жоден учасник. Вічного циклу теж немає — щойно подія
    // почалась, findDueForReminder перестає її повертати, тож спроб рівно
    // стільки, скільки поллів влазить у 30-хвилинне вікно.
    if (delivered === 0 && transientFailures > 0) continue

    // В усіх інших випадках подія вважається обробленою: або нагадування
    // дійшло, або кожна відмова остаточна (бот заблокований, чат
    // видалений) і повторювати її марно. Часткова доставка теж
    // зараховується — краще, ніж надіслати вдруге тим, хто вже отримав;
    // хто саме не отримав, видно в notification_log.
    await eventsRepository.markReminderSent(event.id)
  }
}

export function startEventReminderScheduler(): void {
  sendDueReminders().catch((error) => console.error('Початкова перевірка нагадувань не вдалася:', error))
  setInterval(() => {
    sendDueReminders().catch((error) => console.error('Перевірка нагадувань не вдалася:', error))
  }, POLL_INTERVAL_MS)
}
