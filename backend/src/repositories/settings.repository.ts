import { supabase } from '../config/supabase'

export interface NotificationSettings {
  chatId?: string
  chatTitle?: string
}

export const settingsRepository = {
  async getNotificationSettings(): Promise<NotificationSettings> {
    const { data, error } = await supabase
      .from('app_settings')
      .select('notification_chat_id, notification_chat_title')
      .eq('id', true)
      .single<{ notification_chat_id: string | null; notification_chat_title: string | null }>()
    if (error) throw error
    return {
      chatId: data.notification_chat_id ?? undefined,
      chatTitle: data.notification_chat_title ?? undefined,
    }
  },

  async setNotificationChat(chatId?: string, chatTitle?: string): Promise<NotificationSettings> {
    const { data, error } = await supabase
      .from('app_settings')
      .upsert({
        id: true,
        notification_chat_id: chatId ?? null,
        notification_chat_title: chatTitle ?? null,
        updated_at: new Date().toISOString(),
      })
      .select('notification_chat_id, notification_chat_title')
      .single<{ notification_chat_id: string | null; notification_chat_title: string | null }>()
    if (error) throw error
    return {
      chatId: data.notification_chat_id ?? undefined,
      chatTitle: data.notification_chat_title ?? undefined,
    }
  },
}
