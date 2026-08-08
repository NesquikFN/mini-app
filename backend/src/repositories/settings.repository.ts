import { query } from '../config/db'

export interface NotificationSettings {
  chatId?: string
  chatTitle?: string
  threadId?: string
  threadTitle?: string
}

interface NotificationSettingsRow {
  notification_chat_id: string | null
  notification_chat_title: string | null
  notification_thread_id: string | null
  notification_thread_title: string | null
}

function toSettings(row: NotificationSettingsRow): NotificationSettings {
  return {
    chatId: row.notification_chat_id ?? undefined,
    chatTitle: row.notification_chat_title ?? undefined,
    threadId: row.notification_thread_id ?? undefined,
    threadTitle: row.notification_thread_title ?? undefined,
  }
}

const SETTINGS_COLUMNS =
  'notification_chat_id, notification_chat_title, notification_thread_id, notification_thread_title'

export interface SocialLinks {
  discordUrl?: string
  telegramUrl?: string
}

interface SocialLinksRow {
  discord_url: string | null
  telegram_url: string | null
}

function toSocialLinks(row: SocialLinksRow): SocialLinks {
  return {
    discordUrl: row.discord_url ?? undefined,
    telegramUrl: row.telegram_url ?? undefined,
  }
}

export const settingsRepository = {
  async getNotificationSettings(): Promise<NotificationSettings> {
    const { rows } = await query<NotificationSettingsRow>(
      `select ${SETTINGS_COLUMNS} from app_settings where id = true`,
    )
    return toSettings(rows[0])
  },

  async getSocialLinks(): Promise<SocialLinks> {
    const { rows } = await query<SocialLinksRow>(
      'select discord_url, telegram_url from app_settings where id = true',
    )
    return toSocialLinks(rows[0])
  },

  async setSocialLinks(discordUrl?: string, telegramUrl?: string): Promise<SocialLinks> {
    const { rows } = await query<SocialLinksRow>(
      `insert into app_settings (id, discord_url, telegram_url, updated_at)
       values (true, $1, $2, now())
       on conflict (id) do update set
         discord_url = excluded.discord_url,
         telegram_url = excluded.telegram_url,
         updated_at = excluded.updated_at
       returning discord_url, telegram_url`,
      [discordUrl ?? null, telegramUrl ?? null],
    )
    return toSocialLinks(rows[0])
  },

  async setNotificationChat(
    chatId?: string,
    chatTitle?: string,
    threadId?: string,
    threadTitle?: string,
  ): Promise<NotificationSettings> {
    const { rows } = await query<NotificationSettingsRow>(
      `insert into app_settings (id, notification_chat_id, notification_chat_title,
         notification_thread_id, notification_thread_title, updated_at)
       values (true, $1, $2, $3, $4, now())
       on conflict (id) do update set
         notification_chat_id = excluded.notification_chat_id,
         notification_chat_title = excluded.notification_chat_title,
         notification_thread_id = excluded.notification_thread_id,
         notification_thread_title = excluded.notification_thread_title,
         updated_at = excluded.updated_at
       returning ${SETTINGS_COLUMNS}`,
      [
        chatId ?? null,
        chatTitle ?? null,
        // Гілка прив'язана до чату — зміна чату завжди скидає її,
        // а не лишає "гілку" від попереднього чату висіти в налаштуваннях.
        chatId ? (threadId ?? null) : null,
        chatId ? (threadTitle ?? null) : null,
      ],
    )
    return toSettings(rows[0])
  },
}
