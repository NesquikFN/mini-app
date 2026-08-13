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
import type { QuickPlanCategory } from '../types/quick-plan'
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

/**
 * Помилка Bot API разом із HTTP-статусом, який повернув Telegram. Назовні
 * (в API застосунку) це та сама 502 TELEGRAM_API_ERROR, що й була, але
 * всередині статус дозволяє відрізнити остаточну відмову від тимчасової:
 * 403 «бот заблокований» повторювати марно, 429 і 5xx — навпаки, єдиний
 * випадок, коли повтор має сенс.
 */
export class TelegramApiError extends AppError {
  readonly telegramStatus: number

  constructor(telegramStatus: number, message: string) {
    super(502, 'TELEGRAM_API_ERROR', message)
    this.name = 'TelegramApiError'
    this.telegramStatus = telegramStatus
  }
}

/**
 * Чи має сенс повторити виклик пізніше.
 *
 * Невідома помилка (обрив мережі, DNS, таймаут fetch — усе, що не наш
 * AppError) вважається тимчасовою: до Telegram ми в такому разі навіть
 * не достукалися, тож судити про долю повідомлення не можемо.
 *
 * BOT_TOKEN_NOT_CONFIGURED свідомо НЕ тимчасова: поки змінну не задали,
 * повтори нічого не змінять.
 */
export function isTransientTelegramFailure(error: unknown): boolean {
  if (error instanceof TelegramApiError) {
    return error.telegramStatus === 429 || error.telegramStatus >= 500
  }
  if (error instanceof AppError) return false
  return true
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
    throw new TelegramApiError(response.status, payload.description ?? 'Помилка Telegram API')
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
  poll?: { id: string; question: string },
): Promise<void> {
  try {
    await send()
    await notificationLogRepository
      .log({
        chatId,
        kind,
        eventId: event?.id,
        eventTitle: event?.title,
        pollId: poll?.id,
        pollQuestion: poll?.question,
        success: true,
      })
      .catch((error: unknown) => console.error('Не вдалося записати журнал сповіщень:', error))
  } catch (error) {
    await notificationLogRepository
      .log({
        chatId,
        kind,
        eventId: event?.id,
        eventTitle: event?.title,
        pollId: poll?.id,
        pollQuestion: poll?.question,
        success: false,
        // Лише error.message від Telegram/AppError — жодних заголовків чи
        // URL, у якому інакше опинився б BOT_TOKEN, тут немає в принципі
        // (callBotApi ніколи не кладе URL у payload.description).
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
  botUsernamePromise ??= botApi<{ username: string }>('getMe')
    .then((me) => me.username)
    .catch((error: unknown) => {
      // Тимчасовий збій Telegram не можна кешувати назавжди: інакше
      // всі deep links лишаються зламаними до перезапуску процесу.
      botUsernamePromise = undefined
      throw error
    })
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

/** Той самий шаблон, що й buildEventDeepLink: t.me/<bot>?startapp=poll_<uuid>
 * відкриває Mini App прямо на HomePage (префікс poll_ читає
 * StartAppRedirect на frontend), не окрему сторінку — опитування не має
 * власного маршруту. */
export async function buildPollDeepLink(pollId: string): Promise<string> {
  const botUsername = await getBotUsername()
  return buildMiniAppDeepLink(botUsername, `poll_${pollId}`)
}

/**
 * Заготовка повідомлення для WebApp.shareMessage (Bot API 8.0,
 * savePreparedInlineMessage). Сигнатура звірена з офіційною
 * документацією: user_id + result (InlineQueryResult) + прапорці
 * allow_*_chats; повертається PreparedInlineMessage { id, expiration_date }.
 *
 * Важливо: бот НІЧОГО не надсилає цим викликом — він лише зберігає
 * заготовку, яку потім відправить сам користувач зі свого клієнта.
 */
export interface PreparedInlineMessageResult {
  id: string
  expiration_date: number
}

/** Мінімальний зріз InlineQueryResultPhoto — рівно ті поля, які ми
 * заповнюємо. photo_url має бути JPEG до 5 МБ (вимога Bot API). */
export interface InlineQueryResultPhotoInput {
  type: 'photo'
  id: string
  photo_url: string
  thumbnail_url: string
  photo_width?: number
  photo_height?: number
  caption?: string
  reply_markup?: { inline_keyboard: Array<Array<{ text: string; url: string }>> }
}

export interface SavePreparedInlineMessageInput {
  user_id: number
  result: InlineQueryResultPhotoInput
  allow_user_chats?: boolean
  allow_bot_chats?: boolean
  allow_group_chats?: boolean
  allow_channel_chats?: boolean
}

export async function savePreparedInlineMessage(
  input: SavePreparedInlineMessageInput,
): Promise<PreparedInlineMessageResult> {
  return botApi<PreparedInlineMessageResult>('savePreparedInlineMessage', {
    ...input,
    // Bot API очікує result як JSON-об'єкт у тілі — botApi серіалізує
    // усе тіло цілком, тож додаткового stringify тут не треба.
  })
}

interface TelegramPhotoSize {
  file_id: string
  file_size?: number
}

interface TelegramUserProfilePhotos {
  total_count: number
  photos: TelegramPhotoSize[][]
}

const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024

async function readTelegramFileLimited(response: Response): Promise<Buffer | undefined> {
  if (!response.body) return undefined
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_PROFILE_PHOTO_BYTES) {
      await reader.cancel()
      return undefined
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks, total)
}

/** Актуальна аватарка через Bot API. На відміну від WebApp photo_url,
 * цей шлях не залежить від CDN-домену чи формату URL, який видав клієнт. */
export async function getTelegramProfilePhoto(telegramUserId: number): Promise<Buffer | undefined> {
  try {
    const profile = await botApi<TelegramUserProfilePhotos>('getUserProfilePhotos', {
      user_id: telegramUserId,
      offset: 0,
      limit: 1,
    })
    const sizes = profile.photos[0]
    const largest = sizes?.[sizes.length - 1]
    if (!largest || (largest.file_size && largest.file_size > MAX_PROFILE_PHOTO_BYTES)) {
      return undefined
    }

    const file = await botApi<{ file_path?: string; file_size?: number }>('getFile', {
      file_id: largest.file_id,
    })
    if (
      !file.file_path ||
      file.file_path.includes('..') ||
      (file.file_size && file.file_size > MAX_PROFILE_PHOTO_BYTES)
    ) {
      return undefined
    }

    const response = await fetch(
      `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${encodeURI(file.file_path)}`,
      { redirect: 'error', signal: AbortSignal.timeout(2_500) },
    )
    const declaredLength = Number(response.headers.get('content-length'))
    if (!response.ok || (Number.isFinite(declaredLength) && declaredLength > MAX_PROFILE_PHOTO_BYTES)) {
      return undefined
    }
    return readTelegramFileLimited(response)
  } catch {
    return undefined
  }
}

/**
 * false означає рівно одне: Telegram відповів, і ця людина в чаті не
 * складається. Тимчасовий збій (429, 5xx, обрив мережі) навмисно летить
 * далі виключенням — інакше під час недоступності Bot API адмін бачив би
 * порожній список чатів і вирішив, що бота звідусіль вигнали.
 */
async function isActiveMember(chatId: string, userId: number): Promise<boolean> {
  try {
    const member = await botApi<{ status: string }>('getChatMember', {
      chat_id: chatId,
      user_id: userId,
    })
    return ACTIVE_MEMBER_STATUSES.includes(member.status)
  } catch (error) {
    if (isTransientTelegramFailure(error)) throw error
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

/**
 * DM 30–60 хв після завершення події (event-rating-reminders.service.ts)
 * із пропозицією лишити коротку оцінку. Кнопка веде на саму подію тим
 * самим deep link, що й анонс/нагадування — EventDetailPage сама показує
 * форму оцінки, коли подія вже архівна, тож для розсилки не потрібен
 * окремий тип deep link.
 */
export async function sendEventRatingRequest(
  chatId: string,
  event: Pick<Event, 'id' | 'title'>,
): Promise<void> {
  const text = escapeMarkdownV2(`⭐ Як пройшла подія «${event.title}»?`)

  await sendAndLog(
    'event_rating_request',
    chatId,
    async () => {
      await botApi('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [[{ text: '⭐ Оцінити в DormHub', url: await buildEventDeepLink(event.id) }]],
        },
      })
    },
    { id: event.id, title: event.title },
  )
}

/**
 * DM тому, кого черга автоматично перевела в учасники. Кнопка веде в
 * саму подію тим самим deep link, що й анонс — людина потрапляє одразу
 * на потрібний екран, а не в загальний список.
 *
 * Помилку відправки навмисно не ловить: sendAndLog уже записав її в
 * notification_log, а викликач (events.service) свідомо ігнорує збій —
 * просування вже зафіксоване в БД і відкочувати його через Telegram не
 * можна.
 */
export async function sendWaitlistPromotionMessage(
  chatId: string,
  event: Pick<EventResponse, 'id' | 'title'>,
): Promise<void> {
  const text = escapeMarkdownV2(
    `🎉 Для вас звільнилося місце у події «${event.title}». Ви автоматично додані до учасників.`,
  )

  await sendAndLog(
    'waitlist_promoted',
    chatId,
    async () => {
      const replyMarkup = {
        inline_keyboard: [[{ text: '🎉 Відкрити подію', url: await buildEventDeepLink(event.id) }]],
      }
      await botApi('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'MarkdownV2',
        reply_markup: replyMarkup,
      })
    },
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

export interface PollBroadcastMessage {
  id: string
  question: string
  options: string[]
}

/**
 * Особисте повідомлення розсилки опитування «Що організувати наступним?».
 * Навмисно НЕ Telegram sendPoll: голосування має лишатись усередині
 * DormHub (результати в Postgres, один голос на схваленого користувача,
 * можливість змінити відповідь до завершення) — sendPoll дав би Telegram
 * власне, паралельне й непов'язане голосування.
 *
 * Запитання й варіанти — текст, який вписав адмін (Zod-схема обмежує
 * довжину й кількість, але не escaping), тож проходять через
 * escapeMarkdownV2 як звичайний рядок, без toTelegramMarkdown.
 */
export async function sendPollBroadcastMessage(
  chatId: string,
  poll: PollBroadcastMessage,
): Promise<void> {
  const optionsList = poll.options
    .map((option, index) => `${index + 1}\\. ${escapeMarkdownV2(option)}`)
    .join('\n')
  const text = [
    '📊 *Що організувати наступним?*',
    escapeMarkdownV2(poll.question),
    optionsList,
  ].join('\n\n')

  await sendAndLog(
    'poll_broadcast',
    chatId,
    async () => {
      await botApi('sendMessage', {
        chat_id: chatId,
        text: text.slice(0, 4096),
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [[{
            text: 'Проголосувати в DormHub',
            url: await buildPollDeepLink(poll.id),
          }]],
        },
      })
    },
    undefined,
    { id: poll.id, question: poll.question },
  )
}

/** Особисте підтвердження після успішного приєднання: дата/час і місце
 * (або "Онлайн") тим самим форматом, що й sendEventAnnouncement, плюс
 * кнопки на гру/чат, якщо організатор їх указав. */
export async function sendEventJoinConfirmation(
  chatId: string,
  event: Pick<EventResponse, 'id' | 'title' | 'date' | 'time' | 'location' | 'isOnline' | 'gameUrl' | 'groupUrl'>,
): Promise<void> {
  const buttons: Array<Array<{ text: string; url: string }>> = []
  if (event.gameUrl) buttons.push([{ text: '🎮 Відкрити гру', url: event.gameUrl }])
  if (event.groupUrl) buttons.push([{ text: '💬 Відкрити чат', url: event.groupUrl }])

  const location = event.isOnline ? 'Онлайн' : event.location
  const text = [
    '✅ Ти успішно приєднався!',
    `🎉 ${event.title}`,
    `📅 ${event.date} о ${event.time.slice(0, 5)}`,
    `📍 ${location}`,
    'До зустрічі!',
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

export interface QuickPlanAnnouncement {
  id: string
  text: string
  category: QuickPlanCategory
}

const QUICK_PLAN_CATEGORY_EMOJI: Record<QuickPlanCategory, string> = {
  sport: '⚽',
  study: '📚',
  food: '🍕',
  walk: '🚶',
  games: '🎮',
  other: '✨',
}

/**
 * Особисте сповіщення про новий швидкий план «Хто зі мною?» — той самий
 * принцип, що й особиста версія sendEventAnnouncement (підписники
 * notify_new_events свого гуртожитку чи всі для онлайн-плану), лише без
 * групового чату: швидкий план — спонтанна річ на кілька годин, для якої
 * в застосунку немає поняття "анонс у групу".
 */
export async function sendQuickPlanAnnouncement(
  chatId: string,
  plan: QuickPlanAnnouncement,
): Promise<void> {
  const emoji = QUICK_PLAN_CATEGORY_EMOJI[plan.category] ?? '✨'
  const text = [
    'Хтось шукає компанію 👀',
    '',
    `${emoji} ${escapeMarkdownV2(plan.text)}`,
    '',
    escapeMarkdownV2('Відкривай DormHub, щоб приєднатися.'),
  ].join('\n')

  await sendAndLog('quick_plan_announcement', chatId, () =>
    botApi('sendMessage', {
      chat_id: chatId,
      text: text.slice(0, 4096),
      parse_mode: 'MarkdownV2',
    }))
}

/** Сповіщення організатору про нового учасника — надсилається лише
 * ПІСЛЯ успішного запису участі (викликається з events.service.joinEvent
 * після того, як addParticipant уже завершився без помилки). */
export async function sendEventOrganizerJoinNotification(
  chatId: string,
  event: Pick<EventResponse, 'id' | 'title' | 'participants' | 'maxParticipants'>,
  joinerName: string,
): Promise<void> {
  const text = [
    'До твоєї події приєднався новий учасник 🙌',
    `👤 ${escapeMarkdownV2(joinerName)}`,
    `🎉 ${escapeMarkdownV2(event.title)}`,
    escapeMarkdownV2(`Учасників: ${event.participants.length} / ${event.maxParticipants}`),
  ].join('\n')

  await sendAndLog(
    'organizer_join_notification',
    chatId,
    () => botApi('sendMessage', { chat_id: chatId, text: text.slice(0, 4096), parse_mode: 'MarkdownV2' }),
    { id: event.id, title: event.title },
  )
}
