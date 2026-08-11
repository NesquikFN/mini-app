import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { env } from '../config/env'
import { AppError } from '../utils/AppError'
import { eventsRepository } from '../repositories/events.repository'
import { usersRepository } from '../repositories/users.repository'
import { vipsRepository } from '../repositories/vips.repository'
import { gpusRepository } from '../repositories/gpus.repository'
import { dormitoriesRepository } from '../repositories/dormitories.repository'
import { NO_DORMITORY_ID } from '../types/dormitory'
import {
  renderShareCard,
  SHARE_CARD_CONTENT_TYPE,
  loadParticipantAvatar,
  normalizeParticipantAvatar,
  type ShareCardFormat,
  type ShareCardInput,
} from '../utils/shareCard'
import { signShareToken, verifyShareToken } from './share-token.service'
import {
  buildEventDeepLink,
  getTelegramProfilePhoto,
  savePreparedInlineMessage,
} from './telegram-notifications.service'
import type { Event } from '../types/event'

/**
 * Поширення події карткою в Telegram.
 *
 * Приватність: для VIP/ГПУ-події той, хто не має ролі, взагалі не
 * отримує токена (див. resolveShareContext — подія для нього просто не
 * існує, 404). Але навіть у того, хто роль має, картка може піти в
 * загальний чат, де ролі немає ні в кого, тож у самій картинці для
 * закритих подій деталі не друкуються: лише «Закрита подія DormHub».
 * Реальний доступ усе одно перевіряє deep link після відкриття.
 */

/** Скільки карток тримаємо на диску для однієї події. Кожен новий
 * fingerprint (змінилась назва, час, кількість учасників) створює новий
 * файл, а найстаріші прибираються — тож кеш не росте нескінченно. */
const MAX_CACHED_CARDS_PER_EVENT = 4

const SHARE_CACHE_DIRNAME = 'share-cards'

export interface ShareContext {
  event: Event
  /** Друкувати «Закрита подія» замість реальних даних. */
  locked: boolean
}

/**
 * Єдина точка перевірки доступу перед будь-яким поширенням. Ті самі
 * правила, що й у getEvent: гуртожиток для офлайн-події та роль для
 * VIP/ГПУ. Дані події беруться з БД за id — нічого з тіла запиту.
 */
export async function resolveShareContext(
  eventId: string,
  viewerId: string,
): Promise<ShareContext> {
  const event = await eventsRepository.findById(eventId)
  if (!event) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }

  const [viewer, isVip, isGpu] = await Promise.all([
    usersRepository.getUserById(viewerId),
    vipsRepository.isVip(viewerId),
    gpusRepository.isGpu(viewerId),
  ])

  const blocked =
    (!event.isOnline && viewer?.dormitoryId === NO_DORMITORY_ID) ||
    (event.vipOnly && !isVip) ||
    (event.gpuOnly && !isGpu)

  if (blocked) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Подію не знайдено')
  }

  return { event, locked: event.vipOnly || event.gpuOnly }
}

/** Стабільний відбиток вмісту картки: змінюється рівно тоді, коли
 * змінюється те, що на ній намальовано. Використовується як ім'я файлу
 * в кеші, тож повторне поширення тієї самої події нічого не перегенерує. */
export function shareCardFingerprint(
  event: Event,
  format: ShareCardFormat,
  locked: boolean,
): string {
  const parts = [
    // Версія рендера входить у ключ, щоб Railway Volume не продовжував
    // віддавати старий дизайн після змін шрифтів, фону чи аватарок.
    'share-card-v6-adaptive-poster-title',
    event.id,
    event.title,
    event.date,
    event.time,
    event.location,
    String(event.isOnline),
    String(event.maxParticipants),
    String(event.participantIds.length),
    // На картці є ініціали перших трьох учасників. Самої кількості
    // недостатньо: після leave + join вона може не змінитись, а склад — так.
    ...event.participantIds.slice(0, 3),
    String(event.vipOnly),
    String(event.gpuOnly),
    event.imageUrl ?? '',
    format,
    String(locked),
  ]
  return createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 32)
}

function cacheDirFor(eventId: string): string {
  // eventId — провалідований UUID (Zod на маршруті), тож у шлях не
  // потрапляє нічого з довільного вводу.
  return resolve(env.UPLOADS_DIR, SHARE_CACHE_DIRNAME, eventId)
}

function extensionFor(format: ShareCardFormat): string {
  return format === 'chat' ? 'jpg' : 'png'
}

/** Прибирає зайві картки події, лишаючи найсвіжіші. */
async function pruneCache(dir: string, keep: string): Promise<void> {
  try {
    // Тимчасові файли паралельних рендерів не чіпаємо: видалити такий
    // файл між write і rename означало б зірвати кешування сусіднього запиту.
    const files = (await readdir(dir)).filter((file) => /\.(jpg|png)$/i.test(file))
    if (files.length <= MAX_CACHED_CARDS_PER_EVENT) return
    const candidates = await Promise.all(
      files
        .filter((file) => file !== keep)
        .map(async (file) => ({ file, mtimeMs: (await stat(resolve(dir, file))).mtimeMs })),
    )
    const stale = candidates
      .sort((left, right) => left.mtimeMs - right.mtimeMs)
      .slice(0, files.length - MAX_CACHED_CARDS_PER_EVENT)
      .map(({ file }) => file)
    await Promise.all(stale.map((file) => rm(resolve(dir, file), { force: true })))
  } catch {
    // Кеш — оптимізація; будь-яка проблема з прибиранням не повинна
    // ламати саме поширення.
  }
}

/**
 * Картка з кешу або згенерована на вимогу. Запис атомарний
 * (tmp + rename), як і в uploads.ts — паралельні запити ніколи не
 * прочитають напівзаписаний файл.
 */
export async function getShareCardImage(
  context: ShareContext,
  format: ShareCardFormat,
): Promise<Buffer> {
  const fingerprint = shareCardFingerprint(context.event, format, context.locked)
  const fileName = `${fingerprint}.${extensionFor(format)}`
  const dir = cacheDirFor(context.event.id)
  const fullPath = resolve(dir, fileName)

  try {
    return await readFile(fullPath)
  } catch {
    // Кешу ще немає — генеруємо нижче.
  }

  const input = await buildCardInput(context, format)
  const buffer = await renderShareCard(input, format)

  let tempPath: string | null = null
  try {
    await mkdir(dir, { recursive: true })
    tempPath = `${fullPath}.${randomUUID()}.tmp`
    await writeFile(tempPath, buffer)
    await rename(tempPath, fullPath)
    await pruneCache(dir, fileName)
  } catch {
    // Не змогли зберегти — віддаємо згенероване з пам'яті.
  } finally {
    // Якщо запис або rename урвався, тимчасовий файл не повинен
    // назавжди залишатись у volume й витісняти корисні картки з кешу.
    if (tempPath) await rm(tempPath, { force: true }).catch(() => undefined)
  }

  return buffer
}

async function buildCardInput(
  context: ShareContext,
  _format: ShareCardFormat,
): Promise<ShareCardInput> {
  const { event, locked } = context

  // Для відкритої події показуємо до трьох профілів. Фото проходять
  // окремий Telegram-only loader; якщо воно недоступне, лишається ініціал.
  const participantUsers = locked
    ? []
    : await usersRepository.getShareCardUsersByIds(event.participantIds.slice(0, 3))
  const participants = await Promise.all(
    participantUsers.map(async (user) => {
      // Спочатку Bot API — він стабільніший за photo_url із WebApp і не
      // залежить від того, який CDN/формат повернув конкретний клієнт.
      const botPhoto = user.photoUrl
        ? await getTelegramProfilePhoto(user.telegramId)
        : undefined
      return {
        displayName: user.nickname ?? user.firstName,
        avatarDataUri:
          (botPhoto ? await normalizeParticipantAvatar(botPhoto) : undefined) ??
          (await loadParticipantAvatar(user.photoUrl)),
      }
    }),
  )

  const dormitoryName = locked || event.isOnline
    ? undefined
    : (await dormitoriesRepository.findAll()).find((dorm) => dorm.id === event.dormitoryId)?.name

  return {
    eventId: event.id,
    title: event.title,
    date: event.date,
    time: event.time,
    location: event.location,
    isOnline: event.isOnline,
    dormitoryName,
    participantCount: event.participantIds.length,
    maxParticipants: event.maxParticipants,
    participants,
    vipOnly: event.vipOnly,
    gpuOnly: event.gpuOnly,
    hideDetails: locked,
    // URL використовується лише для вибору same-origin файлу в uploads
    // (зокрема обкладинки шаблону), а не для мережевого завантаження.
    hasCover: Boolean(event.imageUrl),
    coverImageUrl: event.imageUrl,
  }
}

/** Публічний (але підписаний) URL картки — саме його бачить Telegram. */
export function buildShareCardUrl(
  eventId: string,
  format: ShareCardFormat,
  locked: boolean,
): string {
  const token = signShareToken({ eventId, format, locked })
  return `${env.PUBLIC_URL}/api/share-cards/${eventId}.${extensionFor(format)}?format=${format}&token=${token}`
}

/** Перевірка токена для публічного endpoint. Повертає контекст без
 * жодної сесії — сам токен і є доказом права на цю картку. */
export async function resolveShareContextFromToken(
  eventId: string,
  format: ShareCardFormat,
  token: string,
): Promise<ShareContext> {
  const payload = verifyShareToken(token, { eventId, format })
  const event = await eventsRepository.findById(eventId)
  if (!event) {
    throw new AppError(404, 'SHARE_CARD_NOT_FOUND', 'Картку не знайдено')
  }
  // locked береться з підписаного payload, а не перераховується: інакше
  // зміна ролі події вже після видачі токена могла б розкрити деталі.
  return { event, locked: payload.locked || event.vipOnly || event.gpuOnly }
}

export function shareCardContentType(format: ShareCardFormat): string {
  return SHARE_CARD_CONTENT_TYPE[format]
}

export interface PreparedShareMessage {
  preparedMessageId: string
  expirationDate: number
}

/**
 * Готує повідомлення, яке користувач потім надішле сам через
 * WebApp.shareMessage (Bot API 8.0). Бот нічого нікому не надсилає — він
 * лише зберігає заготовку для конкретного user_id.
 */
export async function prepareShareMessage(
  context: ShareContext,
  telegramUserId: number,
): Promise<PreparedShareMessage> {
  const { event, locked } = context
  const photoUrl = buildShareCardUrl(event.id, 'chat', locked)
  const deepLink = await buildEventDeepLink(event.id)

  const caption = locked
    ? 'Закрита подія в DormHub'
    : `🎉 ${event.title}\nПриєднуйся до події в DormHub!`

  const { width, height } = { width: 1200, height: 630 }

  const prepared = await savePreparedInlineMessage({
    user_id: telegramUserId,
    result: {
      type: 'photo',
      id: randomUUID(),
      photo_url: photoUrl,
      thumbnail_url: photoUrl,
      photo_width: width,
      photo_height: height,
      caption: caption.slice(0, 1024),
      reply_markup: {
        inline_keyboard: [[{ text: '🎉 Приєднатися', url: deepLink }]],
      },
    },
    allow_user_chats: true,
    allow_group_chats: true,
    allow_channel_chats: true,
  })

  return {
    preparedMessageId: prepared.id,
    expirationDate: prepared.expiration_date,
  }
}
