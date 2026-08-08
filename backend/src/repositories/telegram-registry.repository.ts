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

  /** Реєструє гілку лише за фактом появи повідомлення з message_thread_id
   * — без справжньої назви (та приходить лише з forum_topic_created/
   * edited, побаченим наживо). Без цього гілки, що існували до
   * підключення webhook або жодного разу не перейменовувались,
   * ніколи не потрапляли в telegram_topics і не з'являлись у списку
   * для адміна, хоча в чаті активно писали. `do nothing` — щоб не
   * затерти справжню назву, якщо вона вже десь була записана. */
  async ensureTopicKnown(chatId: string, threadId: string, placeholderTitle: string): Promise<void> {
    await query(
      `insert into telegram_topics (chat_id, thread_id, title, updated_at)
       values ($1, $2, $3, now())
       on conflict (chat_id, thread_id) do nothing`,
      [chatId, threadId, placeholderTitle],
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
