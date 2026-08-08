import { query } from '../config/db'

export interface StoredChat {
  chatId: string
  title: string
  type: string
}

export interface StoredTopic {
  chatId: string
  threadId: string
  title: string
}

export const telegramRegistryRepository = {
  async upsertChat(
    chatId: string,
    title: string,
    type: string,
    isBotMember: boolean,
  ): Promise<void> {
    await query(
      `insert into telegram_chats (chat_id, title, type, is_bot_member, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (chat_id) do update set
         title = excluded.title,
         type = excluded.type,
         is_bot_member = excluded.is_bot_member,
         updated_at = now()`,
      [chatId, title, type, isBotMember],
    )
  },

  async findMemberChats(): Promise<StoredChat[]> {
    const { rows } = await query<{ chat_id: string; title: string; type: string }>(
      'select chat_id, title, type from telegram_chats where is_bot_member = true order by title asc',
    )
    return rows.map((row) => ({ chatId: row.chat_id, title: row.title, type: row.type }))
  },

  async upsertTopic(chatId: string, threadId: string, title: string): Promise<void> {
    await query(
      `insert into telegram_topics (chat_id, thread_id, title, updated_at)
       values ($1, $2, $3, now())
       on conflict (chat_id, thread_id) do update set
         title = excluded.title,
         updated_at = now()`,
      [chatId, threadId, title],
    )
  },

  async findTopics(chatId: string): Promise<StoredTopic[]> {
    const { rows } = await query<{ chat_id: string; thread_id: string; title: string }>(
      'select chat_id, thread_id, title from telegram_topics where chat_id = $1 order by title asc',
      [chatId],
    )
    return rows.map((row) => ({ chatId: row.chat_id, threadId: row.thread_id, title: row.title }))
  },
}
