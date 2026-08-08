import { env } from '../config/env'
import { AppError } from '../utils/AppError'
import { telegramRegistryRepository } from '../repositories/telegram-registry.repository'
import { usersRepository } from '../repositories/users.repository'
import type { EventResponse } from './events.service'
import type { Event } from '../types/event'

export interface TelegramChatOption {
  id: string
  title: string
  type: 'group' | 'supergroup' | 'channel'
}

export interface TelegramTopicOption {
  id: string
  title: string
}

interface TelegramChat {
  id: number
  title?: string
  username?: string
  type: string
}

export interface TelegramWebhookMessage {
  chat: TelegramChat
  text?: string
  from?: { first_name: string }
  message_thread_id?: number
  forum_topic_created?: { name: string }
  forum_topic_edited?: { name?: string }
}

export interface TelegramWebhookUpdate {
  update_id: number
  message?: TelegramWebhookMessage
  channel_post?: TelegramWebhookMessage
  my_chat_member?: { chat: TelegramChat; new_chat_member: { status: string } }
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

const ACTIVE_MEMBER_STATUSES = ['creator', 'administrator', 'member']
const TRACKED_CHAT_TYPES = ['group', 'supergroup', 'channel']

function chatTitle(chat: TelegramChat): string {
  return chat.title ?? (chat.username ? `@${chat.username}` : String(chat.id))
}

let botUsernamePromise: Promise<string> | undefined
function getBotUsername(): Promise<string> {
  botUsernamePromise ??= botApi<{ username: string }>('getMe').then((me) => me.username)
  return botUsernamePromise
}

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
 * Persists chat/topic knowledge as Telegram delivers it, instead of
 * re-deriving it from getUpdates() on every request — that history has
 * no retention guarantee (no offset is ever acknowledged), so a chat or
 * topic already seen once could silently fall out of it later, especially
 * once other, busier chats push it out of the window. This is meant to
 * be called from the webhook route for every incoming update.
 */
export async function handleTelegramWebhookUpdate(update: TelegramWebhookUpdate): Promise<void> {
  const message = update.message ?? update.channel_post
  if (message && TRACKED_CHAT_TYPES.includes(message.chat.type)) {
    const chatId = String(message.chat.id)
    await telegramRegistryRepository.upsertChat(chatId, chatTitle(message.chat), message.chat.type, true)

    const topicName = message.forum_topic_created?.name ?? message.forum_topic_edited?.name
    if (message.message_thread_id) {
      const threadId = String(message.message_thread_id)
      if (topicName) {
        await telegramRegistryRepository.upsertTopic(chatId, threadId, topicName)
      } else {
        await telegramRegistryRepository.ensureTopicKnown(chatId, threadId, `Гілка #${threadId}`)
      }
    }
  }

  if (update.my_chat_member && TRACKED_CHAT_TYPES.includes(update.my_chat_member.chat.type)) {
    const { chat, new_chat_member } = update.my_chat_member
    await telegramRegistryRepository.upsertChat(
      String(chat.id),
      chatTitle(chat),
      chat.type,
      ACTIVE_MEMBER_STATUSES.includes(new_chat_member.status),
    )
  }

  // /start only makes sense as a DM to the bot (channel_post has no such
  // command, and groups don't onboard this way) — greet and hand over
  // the Mini App entry point right away instead of leaving a first-time
  // user staring at an empty chat.
  const privateMessage = update.message
  if (privateMessage?.chat.type === 'private') {
    const text = privateMessage.text?.trim()
    if (text?.startsWith('/start')) {
      await sendStartGreeting(String(privateMessage.chat.id), privateMessage.from?.first_name)
    } else if (text?.startsWith('/notifications_off')) {
      await handleNotificationsOffCommand(String(privateMessage.chat.id))
    }
  }
}

/** Той самий "особисто DM тобі щось прийшло → маєш легкий шлях це
 * вимкнути" принцип, що й перемикач на сторінці "Ігри" — команда прямо
 * в чаті з ботом для тих, хто не хоче йти в застосунок заради цього. */
async function handleNotificationsOffCommand(chatId: string): Promise<void> {
  const telegramId = Number(chatId)
  const user = await usersRepository.getUserByTelegramId(telegramId)
  if (user) {
    await usersRepository.setNotifyNewEvents(user.id, false)
  }
  await botApi('sendMessage', {
    chat_id: chatId,
    text: escapeMarkdownV2('🔕 Сповіщення про нові події вимкнено. Увімкнути знову можна перемикачем у розділі «Ігри».'),
    parse_mode: 'MarkdownV2',
  })
}

async function sendStartGreeting(chatId: string, firstName?: string): Promise<void> {
  const greetingName = firstName ? `, ${firstName}` : ''
  // Each line escaped once, *after* the name is interpolated in — doing
  // it the other way round (pre-escaping firstName, then escaping the
  // whole line again) would double-escape its backslashes.
  const text = [
    `👋 Привіт${greetingName}!`,
    'DormHub — Mini App для мешканців гуртожитку: події, ігри та все важливе в одному місці.',
    'Тисни кнопку нижче, щоб відкрити 👇',
  ].map(escapeMarkdownV2).join('\n\n')

  // web_app buttons (real Mini-App launch, not just a link) only work in
  // private chats with the bot — see sendEventAnnouncement for why group
  // messages use a t.me/?startapp= link instead.
  await botApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [[{ text: '🏠 Відкрити DormHub', web_app: { url: env.FRONTEND_URL } }]],
    },
  })
}

/**
 * Chats come from our own registry (kept current by the webhook); the
 * requesting admin's membership is still checked live via getChatMember
 * — that's cheap, always accurate, and scopes the list to chats *this*
 * admin can actually see, not just any chat the bot happens to be in.
 */
export async function listAvailableChats(telegramUserId: number): Promise<TelegramChatOption[]> {
  const stored = await telegramRegistryRepository.findMemberChats()
  const checked = await Promise.all(stored.map(async (chat) => {
    const userIsMember = await isActiveMember(chat.chatId, telegramUserId)
    return userIsMember
      ? { id: chat.chatId, title: chat.title, type: chat.type as TelegramChatOption['type'] }
      : null
  }))
  return checked.filter((chat): chat is TelegramChatOption => chat !== null)
}

export async function listAvailableTopics(chatId: string): Promise<TelegramTopicOption[]> {
  const topics = await telegramRegistryRepository.findTopics(chatId)
  return topics.map((topic) => ({ id: topic.threadId, title: topic.title }))
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
  threadId?: string,
  /** DM-версія цього ж анонсу (announceEvent → notify_new_events
   * підписники) додає підказку, як його вимкнути — у групових чатах
   * (isPersonalNotification=false) цього нема, бо там нема кого
   * "відписувати". */
  isPersonalNotification = false,
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
    isPersonalNotification
      ? escapeMarkdownV2('\n🔕 Вимкнути ці сповіщення: команда /notifications_off боту або перемикач у розділі «Ігри».')
      : '',
  ].filter(Boolean).join('\n')

  const threadParam = threadId ? { message_thread_id: Number(threadId) } : {}
  // Group-chat messages can't use an inline `web_app` button — Telegram
  // only allows that in private chats with the bot, and a plain `url`
  // button (even same-domain) just opens as a normal link with no
  // initData at all. The documented way to deep-link into the Mini App
  // from a group message is a t.me/<bot>?startapp=... link: Telegram
  // recognizes it and launches the Mini App itself, passing the value
  // through as initDataUnsafe.start_param (read on the frontend to jump
  // straight to this event).
  const botUsername = await getBotUsername()
  const replyMarkup = {
    inline_keyboard: [[{
      text: '🎉 Приєднатися',
      url: `https://t.me/${botUsername}?startapp=event_${event.id}`,
    }]],
  }

  if (event.imageUrl) {
    await botApi('sendPhoto', {
      chat_id: chatId,
      photo: event.imageUrl,
      caption: text.slice(0, 1024),
      parse_mode: 'MarkdownV2',
      reply_markup: replyMarkup,
      ...threadParam,
    })
    return
  }

  await botApi('sendMessage', {
    chat_id: chatId,
    text: text.slice(0, 4096),
    parse_mode: 'MarkdownV2',
    reply_markup: replyMarkup,
    ...threadParam,
  })
}

/** DM-нагадування учасникам за ~30 хв до старту (event-reminders.service.ts).
 * На відміну від sendEventAnnouncement — без кнопки приєднання (вони вже
 * учасники) і без опису, лише найважливіше для того, хто вже поспішає. */
export async function sendEventReminder(
  chatId: string,
  event: Pick<Event, 'title' | 'time' | 'location' | 'isOnline'>,
): Promise<void> {
  const location = event.isOnline ? 'Онлайн' : event.location
  const text = [
    `⏰ Нагадування: «${event.title}» починається за 30 хвилин!`,
    `🕐 ${event.time.slice(0, 5)} 📍 ${location}`,
  ].map(escapeMarkdownV2).join('\n')

  await botApi('sendMessage', { chat_id: chatId, text, parse_mode: 'MarkdownV2' })
}
