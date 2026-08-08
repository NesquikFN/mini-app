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

let botIdPromise: Promise<number> | undefined
function getBotId(): Promise<number> {
  botIdPromise ??= botApi<{ id: number }>('getMe').then((me) => me.id)
  return botIdPromise
}

const ACTIVE_MEMBER_STATUSES = ['creator', 'administrator', 'member']

async function isActiveMember(chatId: string, userId: number): Promise<boolean> {
  try {
    const member = await botApi<{ status: string }>('getChatMember', {
      chat_id: chatId,
      user_id: userId,
    })
    return ACTIVE_MEMBER_STATUSES.includes(member.status)
  } catch {
    return false
  }
}

/**
 * getUpdates() replays Telegram's update history (no offset is ever
 * acknowledged — see discoveredChats), so it still lists chats the bot
 * was later removed from. Re-checking both the bot's own membership and
 * the admin's drops those stale entries instead of showing dead chats.
 */
export async function listAvailableChats(telegramUserId: number): Promise<TelegramChatOption[]> {
  const [chats, botId] = await Promise.all([discoveredChats(), getBotId()])
  const checked = await Promise.all(chats.map(async (chat) => {
    const [botIsMember, userIsMember] = await Promise.all([
      isActiveMember(chat.id, botId),
      isActiveMember(chat.id, telegramUserId),
    ])
    return botIsMember && userIsMember ? chat : null
  }))
  return checked.filter((chat): chat is TelegramChatOption => chat !== null)
}

// Telegram MarkdownV2 special characters that must be escaped outside of
// an intentional entity, or the API rejects the message with a 400
// ("can't find end of the entity").
const MDV2_SPECIAL = /[_*[\]()~`>#+\-=|{}.!\\]/g

function escapeMarkdownV2(text: string): string {
  return text.replace(MDV2_SPECIAL, (ch) => `\\${ch}`)
}

/**
 * Event descriptions are typed by admins using casual **bold** markers
 * (not Telegram's own single-asterisk syntax), so they show up as raw
 * asterisks unless translated. Everything outside a **...** pair is
 * escaped so stray Markdown-special characters in free text don't break
 * parsing.
 */
function toTelegramMarkdown(text: string): string {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((segment) => {
      const bold = segment.match(/^\*\*([^*]+)\*\*$/)
      return bold ? `*${escapeMarkdownV2(bold[1])}*` : escapeMarkdownV2(segment)
    })
    .join('')
}

export interface AnnouncementCreator {
  firstName: string
  username?: string
}

export async function sendEventAnnouncement(
  chatId: string,
  event: EventResponse,
  creator?: AnnouncementCreator,
): Promise<void> {
  const location = event.isOnline ? 'Онлайн' : event.location
  const creatorName = creator
    ? creator.username
      ? `@${escapeMarkdownV2(creator.username)}`
      : escapeMarkdownV2(creator.firstName)
    : undefined
  const text = [
    `🎉 Нова подія: *${escapeMarkdownV2(event.title)}*`,
    `📅 ${escapeMarkdownV2(event.date)} о ${escapeMarkdownV2(event.time.slice(0, 5))}`,
    `📍 ${escapeMarkdownV2(location)}`,
    creatorName ? `👤 Створив: ${creatorName}` : '',
    event.description ? `\n${toTelegramMarkdown(event.description)}` : '',
  ].filter(Boolean).join('\n')

  if (event.imageUrl) {
    await botApi('sendPhoto', {
      chat_id: chatId,
      photo: event.imageUrl,
      caption: text.slice(0, 1024),
      parse_mode: 'MarkdownV2',
    })
    return
  }

  await botApi('sendMessage', {
    chat_id: chatId,
    text: text.slice(0, 4096),
    parse_mode: 'MarkdownV2',
  })
}
