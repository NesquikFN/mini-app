import { eventsRepository } from '../repositories/events.repository'
import { NOTIFICATION_CONCURRENCY, sendEventReminder } from './telegram-notifications.service'
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
    await mapWithConcurrency(telegramIds, NOTIFICATION_CONCURRENCY, async (telegramId) => {
      try {
        await sendEventReminder(String(telegramId), event)
      } catch (error) {
        console.error(
          `Не вдалося надіслати нагадування про подію ${event.id} користувачу ${telegramId}:`,
          error,
        )
      }
    })
    // Marked sent even if every individual DM above failed (e.g. bot
    // blocked) — this is a best-effort reminder, not a guaranteed
    // delivery; retrying the same event on every future poll forever
    // would be worse than silently giving up once.
    await eventsRepository.markReminderSent(event.id)
  }
}

export function startEventReminderScheduler(): void {
  sendDueReminders().catch((error) => console.error('Початкова перевірка нагадувань не вдалася:', error))
  setInterval(() => {
    sendDueReminders().catch((error) => console.error('Перевірка нагадувань не вдалася:', error))
  }, POLL_INTERVAL_MS)
}
