import { env } from '../config/env'
import { AppError } from '../utils/AppError'
import { telegramRegistryRepository } from '../repositories/telegram-registry.repository'
import { usersRepository } from '../repositories/users.repository'
import {
  notificationLogRepository,
  type NotificationKind,
} from '../repositories/notification-log.repository'
import type { EventResponse } from './events.service'
import type { Event } from '../types/event'
import { sleep } from '../utils/concurrency'
import { isUserBanned } from '../utils/ban'

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

/** Скільки повідомлень одночасно віддаємо в Telegram при масовій
 * розсилці. Bot API дозволяє ~30 повідомлень за секунду сумарно, тож
 * невелика паралельність тут корисніша за сотні одночасних запитів. */
export const NOTIFICATION_CONCURRENCY = 5

/** Стеля для очікування, яке просить Telegram у 429. Довші паузи не
 * чекаємо — краще визнати відправку невдалою і записати це в журнал,
 * ніж тримати HTTP-запит користувача чи планувальник кілька хвилин. */
const MAX_RETRY_AFTER_SECONDS = 5

interface TelegramApiResponse<T> {
  ok: boolean
  result?: T
  description?: string
  parameters?: { retry_after?: number }
}

async function callBotApi<T>(
  method: string,
  body?: Record<string, unknown>,
): Promise<{ response: Response; payload: TelegramApiResponse<T> }> {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = (await response.json()) as TelegramApiResponse<T>
  return { response, payload }
}

/**
 * Один повтор при 429 з урахуванням retry_after — рівно один, без
 * циклу: якщо Telegram просить чекати й після повтору, відправка
 * вважається невдалою і потрапляє в notification_log. Нескінченних
 * ретраїв тут свідомо немає, інакше зайнятий чат заблокував би
 * планувальник нагадувань назавжди.
 *
 * У повідомленнях про помилку — лише description від Telegram; URL із
 * токеном у логи ніколи не потрапляє.
 */
async function botApi<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  if (!env.BOT_TOKEN) {
    throw new AppError(503, 'BOT_TOKEN_NOT_CONFIGURED', 'Telegram-бот ще не налаштований')
  }

  let { response, payload } = await callBotApi<T>(method, body)

  if (response.status === 429) {
    const retryAfter = payload.parameters?.retry_after
    if (typeof retryAfter === 'number' && retryAfter > 0 && retryAfter <= MAX_RETRY_AFTER_SECONDS) {
      await sleep(retryAfter * 1000)
      ;({ response, payload } = await callBotApi<T>(method, body))
    }
  }

  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new AppError(502, 'TELEGRAM_API_ERROR', payload.description ?? 'Помилка Telegram API')
  }
  return payload.result
}

/**
 * Every actual message dispatch (as opposed to getMe/getChatMember/etc.)
 * goes through here so it lands in notification_log — that's what backs
 * the admin "Журнал сповіщень" page. Logging failure itself never masks
 * or replaces the original send outcome: it's fire-and-forget on success,
 * and on failure the original error still propagates after being logged.
 */
async function sendAndLog(
  kind: NotificationKind,
  chatId: string,
  send: () => Promise<void>,
  event?: { id: string; title: string },
): Promise<void> {
  try {
    await send()
    await notificationLogRepository
      .log({ chatId, kind, eventId: event?.id, eventTitle: event?.title, success: true })
      .catch((error: unknown) => console.error('Не вдалося записати журнал сповіщень:', error))
  } catch (error) {
    await notificationLogRepository
      .log({
        chatId,
        kind,
        eventId: event?.id,
        eventTitle: event?.title,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      .catch((logError: unknown) => console.error('Не вдалося записати журнал сповіщень:', logError))
    throw error
  }
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

export function buildMiniAppDeepLink(
  botUsername: string,
  startParam: string,
  shortName = env.TELEGRAM_APP_SHORT_NAME,
): string {
  const appPath = shortName ? `/${shortName}` : ''
  return `https://t.me/${botUsername}${appPath}?startapp=${encodeURIComponent(startParam)}`
}

/** Посилання, яким користувач може поділитися з будь-якого екрана події.
 * Username беремо через Bot API, щоб не дублювати його в налаштуваннях
 * frontend і не ризикувати створенням застарілих посилань після перейменування бота. */
export async function buildEventDeepLink(eventId: string): Promise<string> {
  const botUsername = await getBotUsername()
  return buildMiniAppDeepLink(botUsername, `event_${eventId}`)
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
    if (!text?.startsWith('/')) return

    // Забанений користувач не отримує від бота нічого й нічого ним не
    // запускає — інакше блокування обходилось би через чат із ботом.
    // Перевірка тут, а не в кожній команді, щоб нову команду не можна
    // було додати повз неї.
    const chatId = String(privateMessage.chat.id)
    const sender = await usersRepository.getUserByTelegramId(Number(chatId))
    if (sender && isUserBanned(sender)) return

    if (text.startsWith('/start')) {
      // /start лишається доступним і несхваленому користувачу: це вхід у
      // Mini App, де він саме й подає заявку на реєстрацію.
      await sendStartGreeting(chatId, privateMessage.from?.first_name)
    } else if (text.startsWith('/notifications_off')) {
      // Команда лише вимикає розсилку й нічого не розкриває, тож
      // доступна незалежно від статусу заявки.
      await handleNotificationsOffCommand(chatId)
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
  await sendAndLog('notifications_off_confirmation', chatId, () =>
    botApi('sendMessage', {
      chat_id: chatId,
      text: escapeMarkdownV2('🔕 Сповіщення про нові події вимкнено. Увімкнути знову можна перемикачем у розділі «Ігри».'),
      parse_mode: 'MarkdownV2',
    }))
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
  await sendAndLog('start_greeting', chatId, () =>
    botApi('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [[{ text: '🏠 Відкрити DormHub', web_app: { url: env.FRONTEND_URL } }]],
      },
    }))
}

/** DM після схвалення заявки на реєстрацію (registration.service.ts).
 * Помилку відправки навмисно не ловить тут — sendAndLog і так пише її в
 * notification_log, а сам виклик має пробросити помилку далі, щоб
 * викликач (approveRegistration) явно вирішив не відкочувати схвалення
 * через збій Telegram API. */
export async function sendRegistrationApprovedMessage(chatId: string): Promise<void> {
  const text = escapeMarkdownV2(
    '✅ Вашу реєстрацію в DormHub схвалено. Тепер ви можете користуватися застосунком.',
  )

  await sendAndLog('registration_approved', chatId, () =>
    botApi('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [[{ text: '🏠 Відкрити DormHub', web_app: { url: env.FRONTEND_URL } }]],
      },
    }))
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
  const kind: NotificationKind = isPersonalNotification ? 'personal_announcement' : 'group_announcement'
  await sendAndLog(
    kind,
    chatId,
    async () => {
      // Group-chat messages can't use an inline `web_app` button — Telegram
      // only allows that in private chats with the bot, and a plain `url`
      // button (even same-domain) just opens as a normal link with no
      // initData at all. The documented way to deep-link into the Mini App
      // from a group message is a Direct Mini App link. Named apps require
      // t.me/<bot>/<short_name>?startapp=...; only a BotFather-configured
      // Main Mini App may omit /<short_name>. Telegram passes the value as
      // start_param (read on the frontend to jump straight to this event).
      // The bot username is resolved *inside* this callback (not
      // above, before sendAndLog) so a getMe failure is itself logged as
      // a failed send, instead of throwing past sendAndLog unnoticed.
      const replyMarkup = {
        inline_keyboard: [[{
          text: '🎉 Приєднатися',
          url: await buildEventDeepLink(event.id),
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
    },
    { id: event.id, title: event.title },
  )
}

/** DM-нагадування учасникам за ~30 хв до старту (event-reminders.service.ts).
 * На відміну від sendEventAnnouncement — без кнопки приєднання (вони вже
 * учасники) і без опису, лише найважливіше для того, хто вже поспішає. */
export async function sendEventReminder(
  chatId: string,
  event: Pick<Event, 'id' | 'title' | 'time' | 'location' | 'isOnline'>,
): Promise<void> {
  const location = event.isOnline ? 'Онлайн' : event.location
  const text = [
    `⏰ Нагадування: «${event.title}» починається за 30 хвилин!`,
    `🕐 ${event.time.slice(0, 5)} 📍 ${location}`,
  ].map(escapeMarkdownV2).join('\n')

  await sendAndLog(
    'event_reminder',
    chatId,
    () => botApi('sendMessage', { chat_id: chatId, text, parse_mode: 'MarkdownV2' }),
    { id: event.id, title: event.title },
  )
}

export interface QuickPlanJoinNotification {
  planText: string
  joinerName: string
}

/**
 * DM автору швидкого плану, коли хтось натиснув «Я з вами». Навмисно
 * коротке й без кнопок: план живе кілька годин, і автору потрібне лише
 * ім'я та нагадування, про який саме план ідеться.
 *
 * Текст плану пишуть користувачі, тож він проходить escapeMarkdownV2 як
 * звичайний рядок (без toTelegramMarkdown) — жодне **форматування** з
 * тексту плану не інтерпретується, а посилання не стають активними
 * сутностями через розмітку.
 */
export async function sendQuickPlanJoinNotification(
  chatId: string,
  { planText, joinerName }: QuickPlanJoinNotification,
): Promise<void> {
  const text = [
    `🙋 *${escapeMarkdownV2(joinerName)}* відгукнувся на ваш план\\!`,
    `📝 ${escapeMarkdownV2(planText)}`,
  ].join('\n')

  await sendAndLog('quick_plan_join', chatId, () =>
    botApi('sendMessage', {
      chat_id: chatId,
      text: text.slice(0, 4096),
      parse_mode: 'MarkdownV2',
    }))
}

/** Особисте підтвердження після успішного приєднання. Посилання
 * надсилаються окремими Telegram-кнопками, якщо організатор їх указав. */
export async function sendEventJoinConfirmation(
  chatId: string,
  event: Pick<EventResponse, 'id' | 'title' | 'gameUrl' | 'groupUrl'>,
): Promise<void> {
  const buttons: Array<Array<{ text: string; url: string }>> = []
  if (event.gameUrl) buttons.push([{ text: '🎮 Відкрити гру', url: event.gameUrl }])
  if (event.groupUrl) buttons.push([{ text: '💬 Відкрити чат', url: event.groupUrl }])

  const text = [
    `✅ Ви приєдналися до події «${event.title}»!`,
    buttons.length > 0
      ? 'Посилання від організатора доступні нижче.'
      : 'Організатор поки не додав посилань.',
  ].map(escapeMarkdownV2).join('\n')

  await sendAndLog(
    'join_confirmation',
    chatId,
    () => botApi('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      ...(buttons.length > 0 ? { reply_markup: { inline_keyboard: buttons } } : {}),
    }),
    { id: event.id, title: event.title },
  )
}
