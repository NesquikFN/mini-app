import { usersRepository } from '../repositories/users.repository'
import { userNotificationSettingsRepository } from '../repositories/user-notification-settings.repository'
import { AppError } from '../utils/AppError'
import type { UpdateNotificationSettingsInput } from '../validation/notification-settings.schemas'

export interface NotificationSettingsResponse {
  newEventsEnabled: boolean
  joinConfirmationEnabled: boolean
  organizerJoinEnabled: boolean
}

/**
 * Фасад над двома джерелами: users.notify_new_events (уже існуюче,
 * розділене з announceEvent/аудиторією опитувань/командою бота — див.
 * коментар у migrations/0032) і новою user_notification_settings (лише
 * дві справді нові настройки). Для клієнта це один ресурс, для бекенду —
 * без дублювання існуючого прапорця.
 */
export async function getMyNotificationSettings(userId: string): Promise<NotificationSettingsResponse> {
  const [user, settings] = await Promise.all([
    usersRepository.getUserById(userId),
    userNotificationSettingsRepository.getEffective(userId),
  ])
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено')
  }
  return {
    newEventsEnabled: user.notifyNewEvents,
    joinConfirmationEnabled: settings.joinConfirmationEnabled,
    organizerJoinEnabled: settings.organizerJoinEnabled,
  }
}

export async function updateMyNotificationSettings(
  userId: string,
  input: UpdateNotificationSettingsInput,
): Promise<NotificationSettingsResponse> {
  const tasks: Promise<unknown>[] = []
  if (input.newEventsEnabled !== undefined) {
    tasks.push(usersRepository.setNotifyNewEvents(userId, input.newEventsEnabled))
  }
  if (input.joinConfirmationEnabled !== undefined || input.organizerJoinEnabled !== undefined) {
    tasks.push(
      userNotificationSettingsRepository.upsert(userId, {
        joinConfirmationEnabled: input.joinConfirmationEnabled,
        organizerJoinEnabled: input.organizerJoinEnabled,
      }),
    )
  }
  await Promise.all(tasks)
  return getMyNotificationSettings(userId)
}
