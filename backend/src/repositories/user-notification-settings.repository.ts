import { query } from '../config/db'

export interface UserNotificationSettingsRow {
  user_id: string
  join_confirmation_enabled: boolean
  organizer_join_enabled: boolean
  created_at: string
  updated_at: string
}

export interface EffectiveNotificationSettings {
  joinConfirmationEnabled: boolean
  organizerJoinEnabled: boolean
}

/** Значення за замовчуванням для користувача, який ще не має рядка в
 * user_notification_settings — ті самі, що й колонкові default'и, тож
 * "рядка немає" і "рядок щойно створено" завжди означають одне й те саме. */
const DEFAULTS: EffectiveNotificationSettings = {
  joinConfirmationEnabled: true,
  organizerJoinEnabled: true,
}

export interface NotificationSettingsPatch {
  joinConfirmationEnabled?: boolean
  organizerJoinEnabled?: boolean
}

export const userNotificationSettingsRepository = {
  async find(userId: string): Promise<UserNotificationSettingsRow | null> {
    const { rows } = await query<UserNotificationSettingsRow>(
      'select * from user_notification_settings where user_id = $1',
      [userId],
    )
    return rows[0] ?? null
  },

  /** Рядок може ще не існувати (ніхто нічого не міняв) — тоді діють
   * default-значення колонок, без запису порожнього рядка лише заради
   * читання. */
  async getEffective(userId: string): Promise<EffectiveNotificationSettings> {
    const row = await this.find(userId)
    if (!row) return DEFAULTS
    return {
      joinConfirmationEnabled: row.join_confirmation_enabled,
      organizerJoinEnabled: row.organizer_join_enabled,
    }
  },

  /**
   * Частковий upsert: перший виклик для користувача створює рядок із
   * default'ами для полів, які зараз не оновлюються (coalesce на
   * стороні insert), наступні — лише змінюють задане поле, не чіпаючи
   * інше. Атомарно, один оператор.
   */
  async upsert(userId: string, patch: NotificationSettingsPatch): Promise<UserNotificationSettingsRow> {
    const { rows } = await query<UserNotificationSettingsRow>(
      `insert into user_notification_settings (user_id, join_confirmation_enabled, organizer_join_enabled)
       values ($1, coalesce($2, true), coalesce($3, true))
       on conflict (user_id) do update set
         join_confirmation_enabled = coalesce($2, user_notification_settings.join_confirmation_enabled),
         organizer_join_enabled = coalesce($3, user_notification_settings.organizer_join_enabled),
         updated_at = now()
       returning *`,
      [userId, patch.joinConfirmationEnabled ?? null, patch.organizerJoinEnabled ?? null],
    )
    return rows[0]
  },
}
