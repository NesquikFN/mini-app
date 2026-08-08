import { supabase } from '../config/supabase'

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

export const settingsRepository = {
  async getNotificationSettings(): Promise<NotificationSettings> {
    const { data, error } = await supabase
      .from('app_settings')
      .select(SETTINGS_COLUMNS)
      .eq('id', true)
      .single<NotificationSettingsRow>()
    if (error) throw error
    return toSettings(data)
  },

  async setNotificationChat(
    chatId?: string,
    chatTitle?: string,
    threadId?: string,
    threadTitle?: string,
  ): Promise<NotificationSettings> {
    const { data, error } = await supabase
      .from('app_settings')
      .upsert({
        id: true,
        notification_chat_id: chatId ?? null,
        notification_chat_title: chatTitle ?? null,
        // Гілка прив'язана до чату — зміна чату завжди скидає її,
        // а не лишає "гілку" від попереднього чату висіти в налаштуваннях.
        notification_thread_id: chatId ? (threadId ?? null) : null,
        notification_thread_title: chatId ? (threadTitle ?? null) : null,
        updated_at: new Date().toISOString(),
      })
      .select(SETTINGS_COLUMNS)
      .single<NotificationSettingsRow>()
    if (error) throw error
    return toSettings(data)
  },
}
