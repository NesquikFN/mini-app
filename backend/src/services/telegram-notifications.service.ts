import { env } from '../config/env'
import { AppError } from '../utils/AppError'
import type { EventResponse } from './events.service'

export interface TelegramChatOption {
  id: string
  title: string
  type: 'group' | 'supergroup' | 'channel'
}

interface TelegramChat {
  id: number
  title?: string
  username?: string
  type: string
}

interface TelegramUpdate {
  message?: { chat: TelegramChat }
  channel_post?: { chat: TelegramChat }
  my_chat_member?: { chat: TelegramChat }
  chat_member?: { chat: TelegramChat }
}

async function botApi<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  if (!env.BOT_TOKEN) {
    throw new AppError(503, 'BOT_TOKEN_NOT_CONFIGURED', 'Telegram-бот ще не налаштований')
  }
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = (await response.json()) as { ok: boolean; result?: T; description?: string }
  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new AppError(502, 'TELEGRAM_API_ERROR', payload.description ?? 'Помилка Telegram API')
  }
  return payload.result
}

async function discoveredChats(): Promise<TelegramChatOption[]> {
  const updates = await botApi<TelegramUpdate[]>('getUpdates')
  const chats = new Map<string, TelegramChatOption>()
  for (const update of updates) {
    const chat = update.message?.chat ?? update.channel_post?.chat ??
      update.my_chat_member?.chat ?? update.chat_member?.chat
    if (!chat || !['group', 'supergroup', 'channel'].includes(chat.type)) continue
    chats.set(String(chat.id), {
      id: String(chat.id),
      title: chat.title ?? (chat.username ? `@${chat.username}` : String(chat.id)),
      type: chat.type as TelegramChatOption['type'],
    })
  }
  return [...chats.values()].sort((a, b) => a.title.localeCompare(b.title, 'uk'))
}

export async function listAvailableChats(telegramUserId: number): Promise<TelegramChatOption[]> {
  const chats = await discoveredChats()
  const checked = await Promise.all(chats.map(async (chat) => {
    try {
      const member = await botApi<{ status: string }>('getChatMember', {
        chat_id: chat.id,
        user_id: telegramUserId,
      })
      return ['creator', 'administrator', 'member'].includes(member.status) ? chat : null
    } catch {
      return null
    }
  }))
  return checked.filter((chat): chat is TelegramChatOption => chat !== null)
}

export async function sendEventAnnouncement(
  chatId: string,
  event: EventResponse,
): Promise<void> {
  const location = event.isOnline ? 'Онлайн' : event.location
  const text = [
    `🎉 Нова подія: ${event.title}`,
    `📅 ${event.date} о ${event.time.slice(0, 5)}`,
    `📍 ${location}`,
    event.description ? `\n${event.description}` : '',
  ].filter(Boolean).join('\n')

  if (event.imageUrl) {
    await botApi('sendPhoto', {
      chat_id: chatId,
      photo: event.imageUrl,
      caption: text.slice(0, 1024),
    })
    return
  }

  await botApi('sendMessage', { chat_id: chatId, text: text.slice(0, 4096) })
}
